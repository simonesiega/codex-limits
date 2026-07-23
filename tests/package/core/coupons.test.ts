import {expect, test} from "bun:test";
import {writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {getCouponCredentialStatus, getResetCoupons} from "@/package/core/coupons/reset-coupons";
import type {FetchLike} from "@/package/core/types";
import {withTempDirectory} from "@tests/helpers/temp-directory";

test("getResetCoupons fetches live coupons with explicit env credentials", async () => {
  const calls: Array<{authorization: string; accountId: string}> = [];
  const fetchMock: FetchLike = async (_url, init) => {
    calls.push({
      authorization: init.headers.Authorization ?? "",
      accountId: init.headers["ChatGPT-Account-ID"] ?? "",
    });

    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          available_count: 2,
          total_earned_count: 3,
          credits: [
            {
              id: "RateLimitResetCredit_test-1",
              reset_type: "codex_rate_limits",
              status: "available",
              granted_at: "2026-06-11T20:38:07Z",
              expires_at: "2026-07-11T20:38:07Z",
            },
            {
              id: "RateLimitResetCredit_test-2",
              reset_type: "codex_rate_limits",
              status: "available",
              granted_at: "2026-06-17T18:42:45Z",
              expires_at: "2026-07-17T18:42:45Z",
            },
          ],
        }),
    };
  };

  const result = await getResetCoupons({
    env: {
      CODEX_LIMITS_ACCESS_TOKEN: "fake-access-token",
      CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
    },
    fetch: fetchMock,
    now: new Date("2026-07-10T20:38:07Z"),
  });

  expect(result.status).toBe("available");
  expect(result.available).toBe(2);
  expect(result.nextExpirationIn).toBe("1d");
  expect(result.items.map((item) => item.id)).toEqual([
    "RateLimitResetCredit_test-1",
    "RateLimitResetCredit_test-2",
  ]);
  expect(result.items.map((item) => item.resetType)).toEqual([
    "codex_rate_limits",
    "codex_rate_limits",
  ]);
  expect(calls[0]?.authorization).toBe("Bearer fake-access-token");
  expect(calls[0]?.accountId).toBe("fake-account-id");
  expect(JSON.stringify(result)).not.toContain("fake-access-token");
  expect(JSON.stringify(result)).not.toContain("fake-account-id");
});

test("getResetCoupons validates untrusted coupon fields before public output", async () => {
  const result = await getResetCoupons({
    env: {
      CODEX_LIMITS_ACCESS_TOKEN: "fake-access-token",
      CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
    },
    transport: async () => ({
      ok: true,
      status: 200,
      transport: "fetch",
      payload: {
        credits: [
          {
            status: "Bearer fake-response-secret",
            granted_at: "fake-private-account-id",
            expires_at: "fake-secret-token",
          },
          {
            id: " RateLimitResetCredit_trimmed",
            reset_type: "codex_rate_limits",
            status: "available",
            expires_at: "2026-07-11T20:38:07Z",
          },
        ],
      },
    }),
  });

  expect(result.status).toBe("partial");
  expect(result.items).toEqual([]);
  expect(result.warnings).toEqual(["Live reset coupon endpoint ignored malformed coupon entries."]);
  expect(JSON.stringify(result)).not.toContain("fake-response-secret");
  expect(JSON.stringify(result)).not.toContain("fake-private-account-id");
  expect(JSON.stringify(result)).not.toContain("fake-secret-token");
});

test("getResetCoupons rejects malformed timestamps and extra untrusted text", async () => {
  const secret = "sk-fake-response-secret-value";
  const result = await getResetCoupons({
    env: {
      CODEX_LIMITS_ACCESS_TOKEN: "fake-access-token",
      CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
    },
    transport: async () => ({
      ok: true,
      status: 200,
      transport: "fetch",
      payload: {
        credits: [
          {
            status: "available",
            granted_at: `Mon, 01 Jan 2024 00:00:00 GMT (${secret})`,
            expires_at: `Tue, 01 Jan 2030 00:00:00 GMT (${secret})`,
          },
          {
            status: "available",
            granted_at: "2026-02-30T00:00:00Z",
            expires_at: "2026-03-30T00:00:00Z",
          },
        ],
      },
    }),
  });

  expect(result.status).toBe("partial");
  expect(result.items).toEqual([]);
  expect(result.warnings).toEqual(["Live reset coupon endpoint ignored malformed coupon entries."]);
  expect(JSON.stringify(result)).not.toContain(secret);
});

test("getResetCoupons rejects fractional coupon counts", async () => {
  const result = await getResetCoupons({
    env: {
      CODEX_LIMITS_ACCESS_TOKEN: "fake-access-token",
      CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
    },
    transport: async () => ({
      ok: true,
      status: 200,
      transport: "fetch",
      payload: {
        available_count: 1.5,
        total_earned_count: 2.5,
        credits: [],
      },
    }),
  });

  expect(result.status).toBe("partial");
  expect(result.available).toBeNull();
  expect(result.earnedThisPeriod).toBeNull();
  expect(result.warnings).toEqual(["Live reset coupon endpoint ignored malformed summary fields."]);
});

test("getResetCoupons reads detected Codex auth file without exposing secrets", async () => {
  await withAuthHome(async (home) => {
    const result = await getResetCoupons({
      env: {CODEX_LIMITS_HOME: home},
      homeDirectory: join(home, "unused"),
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({credits: [{status: "available", expires_at: "2026-07-11T20:38:07Z"}]}),
      }),
      now: new Date("2026-07-10T20:38:07Z"),
    });

    expect(result.status).toBe("available");
    expect(JSON.stringify(result)).not.toContain("fake-secret-token");
    expect(JSON.stringify(result)).not.toContain("fake-account-id");
  });
});

test("getResetCoupons returns unavailable without credentials", async () => {
  const missingHome = join(tmpdir(), `codex-limits-missing-auth-${crypto.randomUUID()}`);
  const result = await getResetCoupons({
    env: {},
    homeDirectory: missingHome,
    fetch: async () => {
      throw new Error("should not fetch");
    },
  });

  expect(result.status).toBe("unavailable");
  expect(result.warnings.join("\n")).toContain("Live reset coupons require");
  expect(await getCouponCredentialStatus({env: {CODEX_LIMITS_ACCESS_TOKEN: "only-token"}})).toBe(
    "partial"
  );
});

test("getCouponCredentialStatus detects local auth.json", async () => {
  await withAuthHome(async (home) => {
    const status = await getCouponCredentialStatus({
      env: {CODEX_LIMITS_HOME: home},
      homeDirectory: join(home, "unused"),
    });

    expect(status).toBe("configured");
  });
});

function withAuthHome(run: (home: string) => Promise<void>): Promise<void> {
  return withTempDirectory("codex-limits-coupons-auth-", async (home) => {
    await writeFile(
      join(home, "auth.json"),
      JSON.stringify({tokens: {access_token: "fake-secret-token", account_id: "fake-account-id"}}),
      "utf8"
    );
    await run(home);
  });
}
