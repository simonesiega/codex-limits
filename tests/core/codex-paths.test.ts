import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectCodexHome, getCodexHomeCandidatePaths } from "../../src/core/codex/paths";

test("detectCodexHome respects CODEX_LIMITS_HOME", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-limits-home-"));

  try {
    const detection = await detectCodexHome({ env: { CODEX_LIMITS_HOME: home }, homeDirectory: join(home, "unused-home") });

    expect(detection.overrideHome).toBe(home);
    expect(detection.foundHome).toBe(home);
    expect(detection.candidates[0]?.source).toBe("env");
    expect(detection.candidates[0]?.exists).toBe(true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("detectCodexHome respects CODEX_HOME", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-home-"));

  try {
    const detection = await detectCodexHome({ env: { CODEX_HOME: home }, homeDirectory: join(home, "unused-home") });

    expect(detection.foundHome).toBe(home);
    expect(detection.candidates[0]?.path).toBe(home);
    expect(detection.candidates[0]?.source).toBe("env");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("detectCodexHome ignores files as home directories", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-limits-home-file-"));
  const filePath = join(home, "not-a-directory");

  try {
    await writeFile(filePath, "{}", "utf8");

    const detection = await detectCodexHome({ env: { CODEX_LIMITS_HOME: filePath }, homeDirectory: join(home, "unused-home") });

    expect(detection.foundHome).toBeNull();
    expect(detection.candidates[0]?.exists).toBe(false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("getCodexHomeCandidatePaths includes platform defaults", () => {
  const paths = getCodexHomeCandidatePaths({ env: {}, homeDirectory: "C:/Users/Fake", appData: "C:/Users/Fake/AppData/Roaming" });

  expect(paths.length).toBeGreaterThan(1);
  expect(paths[0]?.path).toContain(".codex");
  expect(paths.map((candidate) => candidate.path)).toContain("C:\\Users\\Fake\\Library\\Application Support\\Parall\\Codex\\.codex");
});
