import {expect, test} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {getUsageLimits} from "../../../src/package/core/limits";
import {getLiveUsage} from "../../../src/package/core/usage/live";
import type {FetchLike} from "../../../src/package/core/types";

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
      json: async () => ({
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
  const server = createServer((request, response) => {
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
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected server address info.");
    }

    const result = await getLiveUsage({
      env: {
        CODEX_LIMITS_ACCESS_TOKEN: "fake-access-token",
        CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
      },
      fetch: async () => ({ok: false, status: 403, json: async () => ({})}),
      now: new Date("2026-01-01T00:00:00.000Z"),
      usageEndpoint: `http://127.0.0.1:${address.port}/usage`,
    });

    expect(result.status).toBe("available");
    expect(result.source.kind).toBe("api");
    expect(result.windows.fiveHour?.remainingPercent).toBe(85);
    expect(result.windows.weekly?.remainingPercent).toBe(75);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test("getUsageLimits falls back to local sessions when live usage is unavailable", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-limits-live-fallback-"));

  try {
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
      fetch: async () => ({ok: false, status: 404, json: async () => ({})}),
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result.source.kind).toBe("local");
    expect(result.windows.fiveHour?.remainingPercent).toBe(88);
    expect(result.windows.weekly?.remainingPercent).toBe(87);
  } finally {
    await rm(home, {recursive: true, force: true});
  }
});
