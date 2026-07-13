import {expect, test} from "bun:test";
import {mkdir, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {getUsageLimits} from "@/package/core/limits";
import type {FetchLike} from "@/package/core/types";
import {mapLiveUsagePayload} from "@/package/core/usage/live-payload";
import {getLiveUsage} from "@/package/core/usage/live";
import {withLoopbackServer} from "@tests/helpers/http-server";
import {withTempDirectory} from "@tests/helpers/temp-directory";

test("getLiveUsage fetches current usage with Codex credentials", async () => {
  const calls: Array<{url: string; authorization: string; accountId: string}> = [];
  const fetchMock: FetchLike = async (url, init) => {
    calls.push({
      url,
      authorization: init.headers.Authorization ?? "",
      accountId: init.headers["ChatGPT-Account-ID"] ?? "",
    });

    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          rate_limit: {
            primary_window: {used_percent: 20, reset_at: 1_767_229_200},
            secondary_window: {used_percent: 69, reset_at: 1_767_232_800},
          },
        }),
    };
  };

  const result = await getLiveUsage({
    env: {
      CODEX_LIMITS_ACCESS_TOKEN: "fake-access-token",
      CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
    },
    fetch: fetchMock,
    now: new Date("2026-01-01T00:00:00.000Z"),
    usageEndpoint: "https://example.test/usage",
  });

  expect(result.status).toBe("available");
  expect(result.source.kind).toBe("api");
  expect(result.source.endpoint).toBe("https://example.test/usage");
  expect(result.windows.fiveHour?.remainingPercent).toBe(80);
  expect(result.windows.weekly?.remainingPercent).toBe(31);
  expect(result.windows.weekly?.resetsIn).toBe("2h");
  expect(calls[0]).toEqual({
    url: "https://example.test/usage",
    authorization: "Bearer fake-access-token",
    accountId: "fake-account-id",
  });
  expect(JSON.stringify(result)).not.toContain("fake-access-token");
  expect(JSON.stringify(result)).not.toContain("fake-account-id");
});

test("getLiveUsage retries with native request when fetch is rejected", async () => {
  await withLoopbackServer(
    (request, response) => {
      expect(request.headers.authorization).toBe("Bearer fake-access-token");
      expect(request.headers["chatgpt-account-id"]).toBe("fake-account-id");
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          rate_limit: {
            primary_window: {used_percent: 15, reset_at: 1_767_229_200},
            secondary_window: {used_percent: 25, reset_at: 1_767_232_800},
          },
        })
      );
    },
    async (origin) => {
      const result = await getLiveUsage({
        env: {
          CODEX_LIMITS_ACCESS_TOKEN: "fake-access-token",
          CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
        },
        fetch: async () => ({ok: false, status: 403, json: async () => ({})}),
        now: new Date("2026-01-01T00:00:00.000Z"),
        usageEndpoint: `${origin}/usage`,
      });

      expect(result.status).toBe("available");
      expect(result.source.kind).toBe("api");
      expect(result.windows.fiveHour?.remainingPercent).toBe(85);
      expect(result.windows.weekly?.remainingPercent).toBe(75);
    }
  );
});

test("getUsageLimits preserves partial live windows when local data is unavailable", async () => {
  const missingHome = join(tmpdir(), `codex-limits-no-local-${crypto.randomUUID()}`);
  const result = await getUsageLimits({
    env: {
      CODEX_LIMITS_HOME: missingHome,
      CODEX_LIMITS_ACCESS_TOKEN: "fake-access-token",
      CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
    },
    homeDirectory: missingHome,
    transport: async () => ({
      ok: true,
      status: 200,
      transport: "fetch",
      payload: {rate_limit: {primary_window: {used_percent: 20, reset_at: 1_767_229_200}}},
    }),
    now: new Date("2026-01-01T00:00:00.000Z"),
  });

  expect(result.status).toBe("partial");
  expect(result.source.kind).toBe("api");
  expect(result.windows.fiveHour?.remainingPercent).toBe(80);
  expect(result.windows.weekly).toBeNull();
  expect(result.warnings).toContain("Live usage endpoint returned incomplete usage data.");
  expect(result.warnings).toContain("No readable local Codex home directory was found.");
});

test("getUsageLimits reports unsafe endpoint overrides without crashing", async () => {
  const missingHome = join(tmpdir(), `codex-limits-bad-endpoint-${crypto.randomUUID()}`);
  const result = await getUsageLimits({
    env: {
      CODEX_LIMITS_HOME: missingHome,
      CODEX_LIMITS_ACCESS_TOKEN: "fake-access-token",
      CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
    },
    homeDirectory: missingHome,
    usageEndpoint: "file:///private/usage.json",
  });

  expect(result.status).toBe("unavailable");
  expect(result.warnings).toContain("Live usage endpoint must use HTTPS or loopback HTTP.");
  expect(JSON.stringify(result)).not.toContain("/private/usage.json");
});

test("mapLiveUsagePayload bounds traversal of unusually wide payloads", () => {
  const payload = Object.fromEntries(
    Array.from({length: 1_100}, (_, index) => [
      `field-${index}`,
      index === 1_099
        ? {rate_limit: {primary_window: {used_percent: 20, reset_at: 1_767_229_200}}}
        : {},
    ])
  );

  const result = mapLiveUsagePayload(
    payload,
    "https://example.test/usage",
    new Date("2026-01-01T00:00:00.000Z")
  );

  expect(result.status).toBe("unavailable");
  expect(result.warnings).toEqual(["Live usage endpoint returned an unexpected payload."]);
});

test("getUsageLimits falls back to local sessions when live usage is unavailable", async () => {
  await withTempDirectory("codex-limits-live-fallback-", async (home) => {
    const sessionDir = join(home, "sessions", "2026", "01", "01");
    await mkdir(sessionDir, {recursive: true});
    await writeFile(
      join(sessionDir, "rollout-fake.jsonl"),
      JSON.stringify({
        type: "event_msg",
        timestamp: "2026-01-01T00:00:00.000Z",
        payload: {
          type: "token_count",
          rate_limits: {
            primary: {used_percent: 12, resets_at: 1_767_229_200},
            secondary: {used_percent: 13, resets_at: 1_767_232_800},
          },
        },
      }),
      "utf8"
    );

    const result = await getUsageLimits({
      env: {
        CODEX_LIMITS_HOME: home,
        CODEX_LIMITS_ACCESS_TOKEN: "fake-access-token",
        CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
      },
      homeDirectory: join(home, "unused"),
      transport: async () => ({ok: false, code: "http-error", status: 404}),
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result.source.kind).toBe("local");
    expect(result.windows.fiveHour?.remainingPercent).toBe(88);
    expect(result.windows.weekly?.remainingPercent).toBe(87);
  });
});
