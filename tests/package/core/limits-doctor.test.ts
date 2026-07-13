import {expect, test} from "bun:test";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {getCodexLimits} from "@/package/core/limits";
import {withTempDirectory} from "@tests/helpers/temp-directory";

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
