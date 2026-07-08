import packageJson from "../../../package.json";
import {getResetCoupons} from "../core/coupons/reset-coupons";
import {getCodexLimits} from "../core/limits";
import type {CodexLimitsResult, CouponResult, CouponSummary} from "../core/types";
import {formatCoupons} from "./coupons";
import {formatJson} from "./format-json";
import {runInit} from "./init";
import {formatStatus} from "./status";

type WriteOutput = (text: string) => void;
type RenderTui = (result: CodexLimitsResult) => Promise<void> | void;

/** Options used to run the CLI in production or tests. */
export interface RunCliOptions {
  /** Version string to print for --version, defaults to package.json. */
  version?: string;
  /** Output writer for stdout, defaults to process.stdout. */
  stdout?: WriteOutput;
  /** Output writer for stderr, defaults to process.stderr. */
  stderr?: WriteOutput;
  /** Limits loader override used by tests. */
  getLimits?: () => Promise<CodexLimitsResult>;
  /** Reset coupons loader override used by tests. */
  getCoupons?: () => Promise<CouponResult>;
  /** TUI renderer override used by tests. */
  renderTui?: RenderTui;
}

const HELP_TEXT = `codex-limits

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
  status      Print a non-interactive usage summary
  coupons     Print reset-credit coupon information
  init        Install optional agent integrations

Options:
  --json          Print JSON only
  -h, --help      Print this help text
  -v, --version   Print the package version

Environment:
  CODEX_LIMITS_HOME            Override the local Codex data directory
  CODEX_LIMITS_ACCESS_TOKEN    Access token for live reset coupons
  CODEX_LIMITS_ACCOUNT_ID      Account ID for live reset coupons
  CODEX_LIMITS_USAGE_ENDPOINT Override the live usage endpoint

Safety:
  The TUI never prints tokens, account IDs, auth headers, cookies, or raw local files.
`;

/**
 * Runs the CLI command for the provided arguments.
 *
 * @param args - Command-line arguments without node or script path.
 * @param options - Optional dependency overrides for tests.
 * @returns Process exit code that should be used by the entry point.
 */
export async function runCli(args: string[], options: RunCliOptions = {}): Promise<number> {
  const stdout = options.stdout ?? writeStdout;
  const stderr = options.stderr ?? writeStderr;
  const getLimits = options.getLimits ?? getCodexLimits;
  const getCoupons = options.getCoupons ?? getResetCoupons;
  const renderTui = options.renderTui ?? renderDefaultTui;
  const version = options.version ?? packageJson.version;

  if (args.length === 0) {
    await renderTui(await getLimits());
    return 0;
  }

  if (args.length === 1 && args[0] === "--json") {
    stdout(formatJson(formatLimitsData(await getLimits())));
    return 0;
  }

  if (args[0] === "init") {
    return runInit(args.slice(1), {stdout, stderr});
  }

  if (args.length === 1 && args[0] === "status") {
    stdout(formatStatus(await getLimits()));
    return 0;
  }

  if (args.length === 1 && args[0] === "coupons") {
    stdout(formatCoupons(await getCoupons()));
    return 0;
  }

  if (args.length === 2 && args[0] === "coupons" && args[1] === "--json") {
    stdout(formatJson(formatCouponData(await getCoupons())));
    return 0;
  }

  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    stdout(getHelpText());
    return 0;
  }

  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
    stdout(`${version}\n`);
    return 0;
  }

  stderr(`Unknown command or option: ${args.join(" ")}\n\n${getHelpText()}`);
  return 1;
}

/**
 * Returns CLI help text.
 *
 * @returns Human-readable help text ending with a newline.
 */
export function getHelpText(): string {
  return HELP_TEXT;
}

/**
 * Dynamically loads and renders the Ink TUI.
 *
 * @param result - Normalized Codex limits result to render.
 * @returns A promise that resolves after Ink exits.
 */
async function renderDefaultTui(result: CodexLimitsResult): Promise<void> {
  const {renderApp} = await import("../tui/app");
  await renderApp(result);
}

/**
 * Writes text to process stdout.
 *
 * @param text - Text to write.
 * @returns Nothing.
 */
function writeStdout(text: string): void {
  process.stdout.write(text);
}

/**
 * Writes text to process stderr.
 *
 * @param text - Text to write.
 * @returns Nothing.
 */
function writeStderr(text: string): void {
  process.stderr.write(text);
}

/**
 * Keeps JSON output aligned with the visible dashboard data.
 *
 * @param result - Full internal limits result.
 * @returns Public usage and coupon data.
 */
function formatLimitsData(result: CodexLimitsResult): {
  windows: CodexLimitsResult["windows"];
  coupons: ReturnType<typeof formatCouponData> | null;
  warnings: string[];
} {
  return {
    windows: result.windows,
    coupons: result.coupons ? formatCouponData(result.coupons) : null,
    warnings: result.warnings,
  };
}

/**
 * Keeps coupon JSON output aligned with the visible reset-coupon data.
 *
 * @param result - Full internal coupon result.
 * @returns Public coupon summary and rows.
 */
function formatCouponData(
  result: CouponSummary
): Pick<
  CouponSummary,
  | "available"
  | "earnedThisPeriod"
  | "nextExpirationDate"
  | "nextExpirationIn"
  | "items"
  | "warnings"
> {
  return {
    available: result.available,
    earnedThisPeriod: result.earnedThisPeriod,
    nextExpirationDate: result.nextExpirationDate,
    nextExpirationIn: result.nextExpirationIn,
    items: result.items,
    warnings: result.warnings,
  };
}
