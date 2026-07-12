/**
 * Store the metadata for the root CLI commands and flags used by the parser.
 */
export const CLI_COMMANDS = {
  status: {name: "status", description: "Print a non-interactive usage summary"},
  coupons: {name: "coupons", description: "Print reset-credit coupon information"},
  init: {name: "init", description: "Install optional agent integrations"},
} as const;

/**
 * Store the metadata for the root CLI flags used by the parser.
 */
export const CLI_FLAGS = {
  json: {long: "--json", description: "Print JSON only"},
  help: {long: "--help", short: "-h", description: "Print this help text"},
  version: {long: "--version", short: "-v", description: "Print the package version"},
} as const;

/**
 * Store the metadata for the environment variables used by the CLI.
 */
const ENVIRONMENT = [
  ["CODEX_LIMITS_HOME", "Override the local Codex data directory", 28],
  ["CODEX_HOME", "Override the local Codex data directory", 28],
  ["CODEX_LIMITS_ACCESS_TOKEN", "Access token for live reset coupons", 28],
  ["CODEX_LIMITS_ACCOUNT_ID", "Account ID for live reset coupons", 28],
  ["CODEX_LIMITS_USAGE_ENDPOINT", "Override the live usage endpoint", 28],
] as const;

/**
 * Generate the help text for the CLI, including usage instructions, commands, options, and environment variables.
 * @returns - The formatted help text string.
 */
export function getHelpText(): string {
  // Command lines
  const commandLines = Object.values(CLI_COMMANDS)
    .map((command) => `  ${command.name.padEnd(11)} ${command.description}`)
    .join("\n");

  // Option lines
  const optionLines = [
    `  ${CLI_FLAGS.json.long.padEnd(15)} ${CLI_FLAGS.json.description}`,
    `  ${`${CLI_FLAGS.help.short}, ${CLI_FLAGS.help.long}`.padEnd(15)} ${CLI_FLAGS.help.description}`,
    `  ${`${CLI_FLAGS.version.short}, ${CLI_FLAGS.version.long}`.padEnd(15)} ${CLI_FLAGS.version.description}`,
  ].join("\n");

  // Environment lines
  const environmentLines = ENVIRONMENT.map(
    ([name, description, width]) => `  ${name.padEnd(width)} ${description}`
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
