import {expect, test} from "bun:test";
import {mkdir, symlink, utimes, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {readCodexSessions} from "@/package/core/codex/session-reader";
import {readCodexState} from "@/package/core/codex/state-reader";
import {parseUsageFromSessions} from "@/package/core/usage/normalizer";
import {withTempDirectory} from "@tests/helpers/temp-directory";

test("readCodexState reads safe JSON and skips sensitive files", async () => {
  await withTempDirectory("codex-limits-state-", async (home) => {
    await writeFile(join(home, "auth.json"), "fake_token=do-not-print", "utf8");
    await writeFile(
      join(home, "limits.json"),
      JSON.stringify({fiveHour: {remainingPercent: 80}}),
      "utf8"
    );

    const state = await readCodexState(home);
    expect(state.files.map((file) => file.relativePath)).toEqual(["limits.json"]);
    expect(state.warnings).toContain("Skipped a sensitive-looking local file.");
    expect(JSON.stringify(state)).not.toContain("fake_token");
  });
});

test("readCodexState bounds malformed and oversized JSON files", async () => {
  await withTempDirectory("codex-limits-state-bounds-", async (home) => {
    await writeFile(join(home, "broken.json"), "{not json", "utf8");
    await writeFile(join(home, "huge.json"), "x".repeat(1_000_001), "utf8");

    const state = await readCodexState(home);
    expect(state.files).toHaveLength(1);
    expect(state.files[0]).toMatchObject({relativePath: "broken.json", error: "invalid-json"});
    expect(state.warnings).toContain("Could not parse JSON in broken.json.");
    expect(state.warnings).toContain(
      "Skipped huge.json because it is too large to inspect safely."
    );
    expect(state.warnings.join("\n")).not.toContain(home);
  });
});

if (process.platform !== "win32") {
  test("local readers do not follow nested symbolic links", async () => {
    await withTempDirectory("codex-limits-symlinks-", async (root) => {
      const home = join(root, "home");
      const outside = join(root, "outside");
      await mkdir(join(home, "sessions"), {recursive: true});
      await mkdir(outside, {recursive: true});
      await writeFile(
        join(outside, "limits.json"),
        JSON.stringify({fiveHour: {remainingPercent: 99}}),
        "utf8"
      );
      await writeFile(
        join(outside, "rollout-outside.jsonl"),
        JSON.stringify({
          type: "event_msg",
          payload: {type: "token_count", rate_limits: {primary: {used_percent: 1}}},
        }),
        "utf8"
      );
      await symlink(join(outside, "limits.json"), join(home, "linked.json"), "file");
      await symlink(outside, join(home, "sessions", "linked"), "dir");

      const [state, sessions] = await Promise.all([readCodexState(home), readCodexSessions(home)]);
      expect(state.files).toEqual([]);
      expect(state.warnings).toContain(
        "Skipped symbolic links while inspecting local Codex state."
      );
      expect(sessions.latestSnapshot).toBeNull();
      expect(sessions.warnings).toContain(
        "Skipped symbolic links while inspecting Codex sessions."
      );
      expect(JSON.stringify({state, sessions})).not.toContain("remainingPercent");
    });
  });
}

test("readCodexSessions extracts latest token-count rate-limit snapshot", async () => {
  await withTempDirectory("codex-limits-sessions-", async (home) => {
    const sessionDir = join(home, "sessions", "2026", "07", "05");
    await mkdir(sessionDir, {recursive: true});
    await writeFile(
      join(sessionDir, "rollout-fake.jsonl"),
      [
        JSON.stringify({type: "session_meta", payload: {id: "thread_fake"}}),
        "not json",
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-07-05T10:00:00.000Z",
          payload: {
            type: "token_count",
            rate_limits: {
              primary: {used_percent: 8, resets_at: 1_767_229_200},
              secondary: {used_percent: 9, resets_at: 1_767_232_800},
            },
          },
        }),
      ].join("\n"),
      "utf8"
    );

    const sessions = await readCodexSessions(home);
    const usage = parseUsageFromSessions(sessions, new Date("2026-01-01T00:00:00.000Z"));
    expect(sessions.files).toHaveLength(1);
    expect(sessions.latestSnapshot?.threadId).toBe("thread_fake");
    expect(usage.status).toBe("available");
    expect(usage.windows.fiveHour?.remainingPercent).toBe(92);
    expect(usage.windows.weekly?.resetsIn).toBe("2h");
  });
});

test("readCodexSessions skips an oversized JSONL line without losing later snapshots", async () => {
  await withTempDirectory("codex-limits-session-lines-", async (home) => {
    const sessionDir = join(home, "sessions", "2026", "07", "05");
    await mkdir(sessionDir, {recursive: true});
    await writeFile(
      join(sessionDir, "rollout-lines.jsonl"),
      [
        `{"oversized":"${"x".repeat(1_000_001)}"}`,
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-07-05T10:00:00.000Z",
          payload: {
            type: "token_count",
            rate_limits: {primary: {used_percent: 25, resets_at: 1_767_229_200}},
          },
        }),
      ].join("\n"),
      "utf8"
    );

    const sessions = await readCodexSessions(home);
    expect(sessions.latestSnapshot?.rateLimits.primary).toEqual({
      used_percent: 25,
      resets_at: 1_767_229_200,
    });
    expect(sessions.warnings.join("\n")).toContain("Skipped an oversized JSONL line");
    expect(sessions.warnings.join("\n")).not.toContain("x".repeat(100));
  });
});

test("readCodexSessions sorts all rollout files before parsing", async () => {
  await withTempDirectory("codex-limits-many-sessions-", async (home) => {
    const sessionDir = join(home, "sessions", "2026", "07", "05");
    await mkdir(sessionDir, {recursive: true});
    const oldTime = new Date("2026-01-01T00:00:00.000Z");

    for (let index = 0; index < 60; index += 1) {
      const filePath = join(sessionDir, `rollout-old-${String(index).padStart(2, "0")}.jsonl`);
      await writeFile(
        filePath,
        JSON.stringify({
          type: "event_msg",
          payload: {type: "token_count", rate_limits: {primary: {used_percent: 80}}},
        }),
        "utf8"
      );
      await utimes(filePath, oldTime, oldTime);
    }

    const newestPath = join(sessionDir, "rollout-newest.jsonl");
    await writeFile(
      newestPath,
      JSON.stringify({
        type: "event_msg",
        timestamp: "2026-07-05T10:00:00.000Z",
        payload: {
          type: "token_count",
          rate_limits: {
            primary: {used_percent: 8, resets_at: 1_767_229_200},
            secondary: {used_percent: 9, resets_at: 1_767_232_800},
          },
        },
      }),
      "utf8"
    );
    const newestTime = new Date("2026-07-05T10:00:00.000Z");
    await utimes(newestPath, newestTime, newestTime);

    const sessions = await readCodexSessions(home);
    const usage = parseUsageFromSessions(sessions, new Date("2026-01-01T00:00:00.000Z"));
    expect(sessions.latestSnapshot?.sessionFile).toBe(newestPath);
    expect(usage.windows.fiveHour?.remainingPercent).toBe(92);
    expect(usage.windows.weekly?.remainingPercent).toBe(91);
  });
});
