import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCouponCredentialStatus, getResetCoupons } from "../../../src/package/core/coupons/reset-coupons";
import type { FetchLike } from "../../../src/package/core/types";

test("getResetCoupons fetches live coupons with explicit env credentials", async () => {
  const calls: Array<{ authorization: string; accountId: string }> = [];
  const fetchMock: FetchLike = async (_url, init) => {
    calls.push({ authorization: init.headers.Authorization ?? "", accountId: init.headers["ChatGPT-Account-ID"] ?? "" });

    return {
      ok: true,
      status: 200,
      json: async () => ({
        available_count: 2,
        total_earned_count: 3,
        credits: [
          { status: "available", granted_at: "2026-06-11T20:38:07Z", expires_at: "2026-07-11T20:38:07Z" },
          { status: "available", granted_at: "2026-06-17T18:42:45Z", expires_at: "2026-07-17T18:42:45Z" },
        ],
      }),
    };
  };

  const result = await getResetCoupons({
    env: { CODEX_LIMITS_ACCESS_TOKEN: "fake-access-token", CODEX_LIMITS_ACCOUNT_ID: "fake-account-id" },
    fetch: fetchMock,
    now: new Date("2026-07-10T20:38:07Z"),
  });

  expect(result.status).toBe("available");
  expect(result.available).toBe(2);
  expect(result.nextExpirationIn).toBe("1d");
  expect(calls[0]?.authorization).toBe("Bearer fake-access-token");
  expect(calls[0]?.accountId).toBe("fake-account-id");
  expect(JSON.stringify(result)).not.toContain("fake-access-token");
  expect(JSON.stringify(result)).not.toContain("fake-account-id");
});

test("getResetCoupons reads detected Codex auth file without exposing secrets", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-limits-coupons-auth-"));

  try {
    const authPath = join(home, "auth.json");
    await writeFile(authPath, JSON.stringify({ tokens: { access_token: "fake-secret-token", account_id: "fake-account-id" } }), "utf8");

    const result = await getResetCoupons({
      env: { CODEX_LIMITS_HOME: home },
      homeDirectory: join(home, "unused"),
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ credits: [{ status: "available", expires_at: "2026-07-11T20:38:07Z" }] }),
      }),
      now: new Date("2026-07-10T20:38:07Z"),
    });

    expect(result.status).toBe("available");
    expect(JSON.stringify(result)).not.toContain("fake-secret-token");
    expect(JSON.stringify(result)).not.toContain("fake-account-id");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
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
  expect(await getCouponCredentialStatus({ env: { CODEX_LIMITS_ACCESS_TOKEN: "only-token" } })).toBe("partial");
});

test("getCouponCredentialStatus detects local auth.json", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-limits-credential-status-"));

  try {
    await writeFile(join(home, "auth.json"), JSON.stringify({ tokens: { access_token: "fake-secret-token", account_id: "fake-account-id" } }), "utf8");

    const status = await getCouponCredentialStatus({ env: { CODEX_LIMITS_HOME: home }, homeDirectory: join(home, "unused") });

    expect(status).toBe("configured");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
