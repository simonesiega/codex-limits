/** Root command metadata shared by parsing and help output. */
export const CLI_COMMANDS = {
  status: {name: "status", description: "Print a non-interactive usage summary"},
  coupons: {name: "coupons", description: "Print reset-credit coupon information"},
  init: {name: "init", description: "Install optional agent integrations"},
} as const;

/** Root flag metadata shared by parsing and help output. */
export const CLI_FLAGS = {
  json: {long: "--json", description: "Print JSON only"},
  help: {long: "--help", short: "-h", description: "Print this help text"},
  version: {long: "--version", short: "-v", description: "Print the package version"},
} as const;

const ENVIRONMENT = [
  ["CODEX_LIMITS_HOME", "Override the local Codex data directory"],
  ["CODEX_HOME", "Override the local Codex data directory"],
  ["CODEX_LIMITS_ACCESS_TOKEN", "Access token for live reset coupons"],
  ["CODEX_LIMITS_ACCOUNT_ID", "Account ID for live reset coupons"],
  ["CODEX_LIMITS_USAGE_ENDPOINT", "Override the live usage endpoint"],
] as const;

/** Builds the root command help from the parser's command metadata. */
export function getHelpText(): string {
  const commandLines = Object.values(CLI_COMMANDS)
    .map((command) => `  ${command.name.padEnd(11)} ${command.description}`)
    .join("\n");
  const optionLines = [
    `  ${CLI_FLAGS.json.long.padEnd(15)} ${CLI_FLAGS.json.description}`,
    `  ${`${CLI_FLAGS.help.short}, ${CLI_FLAGS.help.long}`.padEnd(15)} ${CLI_FLAGS.help.description}`,
    `  ${`${CLI_FLAGS.version.short}, ${CLI_FLAGS.version.long}`.padEnd(15)} ${CLI_FLAGS.version.description}`,
  ].join("\n");
  const environmentLines = ENVIRONMENT.map(
    ([name, description]) => `  ${name.padEnd(28)} ${description}`
  ).join("\n");

  return `codex-limits

  A polished TUI dashboard for checking Codex usage limits, reset times, and reset-credit coupons.

  Usage:
    codex-limits              Open the terminal UI
    codex-limits status       Print a plain usage summary
    codex-limits coupons      Print reset-credit coupon information
    codex-limits init         Install optional agent integrations
    codex-limits --json       Print JSON only
    codex-limits --help       Print this help text
    codex-limits --version    Print the package version

  Commands:
  ${commandLines}

  Options:
  ${optionLines}

  Environment:
  ${environmentLines}

  Safety:
    The TUI never prints tokens, account IDs, auth headers, cookies, or raw local files.
  `;
}
