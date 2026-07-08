import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

const postinstallScript = resolve(import.meta.dir, "../../../scripts/postinstall.cjs");

test("postinstall only prints explicit init guidance for global installs", async () => {
  const installRoot = await mkdtemp(join(tmpdir(), "codex-limits-postinstall-"));
  const {CI: _ci, CODEX_LIMITS_SKIP_INIT: _skipInit, ...env} = process.env;

  try {
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
  } finally {
    await rm(installRoot, {recursive: true, force: true});
  }
});
