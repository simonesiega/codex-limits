import {expect, test} from "bun:test";
import {mkdir} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {withTempDirectory} from "@tests/helpers/temp-directory";

const postinstallScript = fileURLToPath(import.meta.resolve("@root/scripts/postinstall.cjs"));

test("postinstall only prints explicit init guidance for global installs", async () => {
  await withTempDirectory("codex-limits-postinstall-", async (installRoot) => {
    const {CI: _ci, CODEX_LIMITS_SKIP_INIT: _skipInit, ...env} = process.env;
    const proc = Bun.spawn([process.execPath, postinstallScript], {
      cwd: installRoot,
      env: {...env, npm_config_global: "true"},
      stderr: "pipe",
      stdout: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe(
      "codex-limits: installed. Run `codex-limits init` to install optional agent integrations.\n"
    );
  });
});

test("postinstall stays silent in non-global, CI, source, skipped, and OpenCode installs", async () => {
  await withTempDirectory("codex-limits-postinstall-silent-", async (root) => {
    const cases = [
      {name: "non-global", cwd: join(root, "regular"), env: {}},
      {name: "CI", cwd: join(root, "ci"), env: {npm_config_global: "true", CI: "true"}},
      {
        name: "explicit skip",
        cwd: join(root, "skip"),
        env: {npm_config_global: "true", CODEX_LIMITS_SKIP_INIT: "true"},
      },
      {name: "source", cwd: join(root, "source"), env: {npm_config_global: "true"}, src: true},
      {
        name: "OpenCode",
        cwd: join(root, ".opencode", "node_modules", "package"),
        env: {npm_config_global: "true"},
      },
    ];
    const {
      CI: _ci,
      CODEX_LIMITS_SKIP_INIT: _skip,
      npm_config_global: _global,
      npm_config_location: _location,
      ...baseEnv
    } = process.env;

    for (const item of cases) {
      await mkdir(item.cwd, {recursive: true});
      if (item.src) {
        await mkdir(join(item.cwd, "src"));
      }
      const proc = Bun.spawn([process.execPath, postinstallScript], {
        cwd: item.cwd,
        env: {...baseEnv, ...item.env},
        stderr: "pipe",
        stdout: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      expect(exitCode, item.name).toBe(0);
      expect(stdout, item.name).toBe("");
      expect(stderr, item.name).toBe("");
    }
  });
});
