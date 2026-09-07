/**
 * @fileoverview Minimal npm postinstall notice. It avoids side effects in source, CI, and
 * host-managed installs, and only points global users toward the explicit agent installer.
 */
const {existsSync} = require("node:fs");
const {join} = require("node:path");

const root = process.cwd();
const isSourceCheckout = existsSync(join(root, "src"));
const normalizedRoot = root.replace(/\\/g, "/");
const isOpencodeManagedInstall =
  normalizedRoot.includes("/.cache/opencode/") ||
  normalizedRoot.includes("/.opencode/node_modules/");
const isGlobalInstall =
  process.env.npm_config_global === "true" || process.env.npm_config_location === "global";
const skip =
  process.env.CI ||
  process.env.CODEX_LIMITS_SKIP_INIT ||
  isSourceCheckout ||
  isOpencodeManagedInstall;

if (!skip && isGlobalInstall) {
  process.stdout.write(
    "codex-limits: installed. Run `codex-limits agents install` to install optional agent integrations.\n"
  );
}
