import {expect, test} from "bun:test";
import {writeFile} from "node:fs/promises";
import {join, normalize} from "node:path";
import {detectCodexHome, getCodexHomeCandidatePaths} from "@/package/core/codex/paths";
import {withTempDirectory} from "@tests/helpers/temp-directory";

test("detectCodexHome respects CODEX_LIMITS_HOME", async () => {
  await withTempDirectory("codex-limits-home-", async (home) => {
    const detection = await detectCodexHome({
      env: {CODEX_LIMITS_HOME: home},
      homeDirectory: join(home, "unused-home"),
    });

    expect(detection.overrideHome).toBe(home);
    expect(detection.foundHome).toBe(home);
    expect(detection.candidates[0]).toMatchObject({source: "env", exists: true});
  });
});

test("detectCodexHome respects CODEX_HOME", async () => {
  await withTempDirectory("codex-home-", async (home) => {
    const detection = await detectCodexHome({
      env: {CODEX_HOME: home},
      homeDirectory: join(home, "unused-home"),
    });

    expect(detection.foundHome).toBe(home);
    expect(detection.candidates[0]).toMatchObject({path: home, source: "env"});
  });
});

test("detectCodexHome ignores files as home directories", async () => {
  await withTempDirectory("codex-limits-home-file-", async (home) => {
    const filePath = join(home, "not-a-directory");
    await writeFile(filePath, "{}", "utf8");

    const detection = await detectCodexHome({
      env: {CODEX_LIMITS_HOME: filePath},
      homeDirectory: join(home, "unused-home"),
    });

    expect(detection.foundHome).toBeNull();
    expect(detection.candidates[0]?.exists).toBe(false);
  });
});

test("getCodexHomeCandidatePaths includes platform defaults", () => {
  const paths = getCodexHomeCandidatePaths({
    env: {},
    homeDirectory: "C:/Users/Fake",
    appData: "C:/Users/Fake/AppData/Roaming",
  });

  expect(paths.length).toBeGreaterThan(1);
  expect(paths[0]?.path).toContain(".codex");
  expect(paths.map((candidate) => candidate.path)).toContain(
    normalize(join("C:/Users/Fake", "Library", "Application Support", "Parall", "Codex", ".codex"))
  );
});
