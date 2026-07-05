import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCodexLimits } from "../../src/core/limits";

test("getCodexLimits combines local usage and live coupons", async () => {
  const home = await createUsageHome();

  try {
    const result = await getCodexLimits({
      env: { CODEX_LIMITS_HOME: home, CODEX_LIMITS_ACCESS_TOKEN: "fake-token", CODEX_LIMITS_ACCOUNT_ID: "fake-account" },
      homeDirectory: join(home, "unused"),
      now: new Date("2026-01-01T00:00:00.000Z"),
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ available_count: 1, credits: [{ status: "available", expires_at: "2026-01-02T00:00:00.000Z" }] }),
      }),
    });

    expect(result.windows.fiveHour?.remainingPercent).toBe(88);
    expect(result.coupons?.available).toBe(1);
    expect(JSON.stringify(result)).not.toContain("fake-token");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

/**
 * Creates a fake Codex home with a usable rollout snapshot.
 *
 * @returns Temporary Codex home path.
 */
async function createUsageHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "codex-limits-combined-"));
  const sessionDir = join(home, "sessions", "2026", "01", "01");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    join(sessionDir, "rollout-fake.jsonl"),
    JSON.stringify({
      type: "event_msg",
      timestamp: "2026-01-01T00:00:00.000Z",
      payload: {
        type: "token_count",
        rate_limits: {
          primary: { used_percent: 12, resets_at: "2026-01-01T01:00:00.000Z" },
          secondary: { used_percent: 13, resets_at: "2026-01-01T02:00:00.000Z" },
        },
      },
    }),
    "utf8",
  );
  return home;
}
