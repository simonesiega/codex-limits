import {expect, test} from "bun:test";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {getCodexDiagnostics} from "@/package/core/doctor";
import {getCodexLimits} from "@/package/core/limits";
import {withTempDirectory} from "@tests/helpers/temp-directory";

test("getCodexDiagnostics reports safe local, authentication, and endpoint checks", async () => {
  await withTempDirectory("codex-limits-doctor-", async (home) => {
    await createUsageHome(home);
    const result = await getCodexDiagnostics({
      env: {
        CODEX_LIMITS_HOME: home,
        CODEX_LIMITS_ACCESS_TOKEN: "fake-secret-token",
        CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
      },
      homeDirectory: join(home, "unused"),
      now: new Date("2026-01-01T00:00:00.000Z"),
      transport: async () => ({
        ok: true,
        status: 200,
        transport: "fetch",
        payload: {
          rate_limit: {
            primary_window: {used_percent: 12, reset_at: 1_767_229_200},
          },
        },
      }),
    });

    expect(result).toEqual({
      codexHomeDetected: true,
      authenticationFound: true,
      localUsageFound: true,
      liveEndpoint: "reachable",
    });
    expect(JSON.stringify(result)).not.toContain(home);
    expect(JSON.stringify(result)).not.toContain("fake-secret-token");
    expect(JSON.stringify(result)).not.toContain("fake-account-id");
  });
});

test("getCodexDiagnostics skips the endpoint safely when authentication is missing", async () => {
  await withTempDirectory("codex-limits-doctor-missing-", async (directory) => {
    const missingHome = join(directory, "missing");
    let transportCalled = false;
    const result = await getCodexDiagnostics({
      env: {CODEX_LIMITS_HOME: missingHome},
      homeDirectory: missingHome,
      appData: missingHome,
      localAppData: missingHome,
      transport: async () => {
        transportCalled = true;
        return {ok: false, code: "network-error", status: null};
      },
    });

    expect(result).toEqual({
      codexHomeDetected: false,
      authenticationFound: false,
      localUsageFound: false,
      liveEndpoint: "not-checked",
    });
    expect(transportCalled).toBe(false);
  });
});

test("getCodexDiagnostics treats an HTTP response as reachable", async () => {
  const result = await getCodexDiagnostics({
    env: {
      CODEX_LIMITS_ACCESS_TOKEN: "fake-secret-token",
      CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
    },
    homeDirectory: "doctor-missing-home",
    appData: "doctor-missing-app-data",
    localAppData: "doctor-missing-local-app-data",
    transport: async () => ({ok: false, code: "http-error", status: 401}),
  });

  expect(result.authenticationFound).toBe(true);
  expect(result.liveEndpoint).toBe("reachable");
});

test("getCodexLimits combines local usage and live coupons", async () => {
  await withTempDirectory("codex-limits-combined-", async (home) => {
    await createUsageHome(home);
    const result = await getCodexLimits({
      env: {
        CODEX_LIMITS_HOME: home,
        CODEX_LIMITS_ACCESS_TOKEN: "fake-token",
        CODEX_LIMITS_ACCOUNT_ID: "fake-account",
      },
      homeDirectory: join(home, "unused"),
      now: new Date("2026-01-01T00:00:00.000Z"),
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            available_count: 1,
            credits: [{status: "available", expires_at: "2026-01-02T00:00:00.000Z"}],
          }),
      }),
    });

    expect(result.windows.fiveHour?.remainingPercent).toBe(88);
    expect(result.coupons?.available).toBe(1);
    expect(JSON.stringify(result)).not.toContain("fake-token");
  });
});

async function createUsageHome(home: string): Promise<void> {
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
          primary: {used_percent: 12, resets_at: "2026-01-01T01:00:00.000Z"},
          secondary: {used_percent: 13, resets_at: "2026-01-01T02:00:00.000Z"},
        },
      },
    }),
    "utf8"
  );
}
