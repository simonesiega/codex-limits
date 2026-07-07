const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const cli = join(root, "dist", "cli.js");
const isSourceCheckout = existsSync(join(root, "src"));
const normalizedRoot = root.replace(/\\/g, "/");
const isOpencodeManagedInstall = normalizedRoot.includes("/.cache/opencode/") || normalizedRoot.includes("/.opencode/node_modules/");
const isGlobalInstall = process.env.npm_config_global === "true" || process.env.npm_config_location === "global";
const skip = process.env.CI || process.env.CODEX_LIMITS_SKIP_INIT || !process.stdout.isTTY || !process.stdin.isTTY;
const canOfferInit = !skip && existsSync(cli) && !isSourceCheckout && !isOpencodeManagedInstall;

if (canOfferInit && isGlobalInstall) {
  const result = spawnSync(process.execPath, [cli, "init", "--postinstall"], { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`codex-limits: optional init failed: ${result.error.message}\n`);
  } else if (result.status !== 0) {
    process.stderr.write(`codex-limits: optional init exited with status ${result.status}. Run \`codex-limits init\` manually to retry.\n`);
  }
} else if (canOfferInit) {
  process.stdout.write("codex-limits: run `codex-limits init` to install optional agent integrations.\n");
}
