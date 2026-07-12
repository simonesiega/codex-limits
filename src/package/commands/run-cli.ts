import {getResetCoupons} from "../core/coupons/reset-coupons";
import {getCodexLimits} from "../core/limits";
import type {CodexLimitsResult, CouponResult} from "../core/types";
import {PACKAGE_VERSION} from "../version";
import {parseCommand} from "./cli-parser";
import {getHelpText} from "./cli-spec";
import {formatCoupons} from "./coupons";
import {formatJson} from "./format-json";
import {runInit} from "./init";
import {toCodexLimitsDto, toCouponSummaryDto} from "./public-dto";
import {operationFailure} from "./safe-error";
import {formatStatus} from "./status";

type WriteOutput = (text: string) => void;
type RenderTui = (result: CodexLimitsResult) => Promise<void> | void;

/**
 * Store the options for running the `codex-limits` CLI command.
 */
export interface RunCliOptions {
  // Codex-limits version.
  version?: string;

  // Output writer for stdout, defaults to process.stdout.
  stdout?: WriteOutput;

  // Output writer for stderr, defaults to process.stderr.
  stderr?: WriteOutput;

  // Codex limits loader override used by tests.
  getLimits?: () => Promise<CodexLimitsResult>;

  // Reset coupons loader override used by tests.
  getCoupons?: () => Promise<CouponResult>;

  // TUI renderer override used by tests.
  renderTui?: RenderTui;
}

/**
 * Main entry point for the `codex-limits` CLI command.
 * @param args - Command-line arguments for the CLI command.
 * @param options - Options for running the CLI command.
 * @returns - Exit code for the CLI command.
 */
export async function runCli(args: string[], options: RunCliOptions = {}): Promise<number> {
  const stdout = options.stdout ?? writeStdout;
  const stderr = options.stderr ?? writeStderr;
  const getLimits = options.getLimits ?? getCodexLimits;
  const getCoupons = options.getCoupons ?? getResetCoupons;

  // Parse the command-line arguments into a structured command object.
  const command = parseCommand(args);

  switch (command.kind) {
    // Help case - display help text and exit with code 0.
    case "help":
      stdout(getHelpText());
      return 0;

    // Version case - display version and exit with code 0.
    case "version":
      stdout(`${options.version ?? PACKAGE_VERSION}\n`);
      return 0;

    // Invalid case - display error message and help text, exit with code 1.
    case "invalid":
      stderr(`Unknown command or option: ${command.input}\n\n${getHelpText()}`);
      return 1;

    // Init case - run the init command and return its exit code.
    case "init":
      try {
        return await runInit(command.args, {stdout, stderr});
      } catch {
        stderr(operationFailure("init"));
        return 1;
      }

    // Dashboard case - load limits and render TUI, exit with code 0 on success or 1 on failure.
    case "dashboard":
      try {
        const result = await getLimits();
        await (options.renderTui ?? renderDefaultTui)(result);
        return 0;
      } catch {
        stderr(operationFailure("dashboard"));
        return 1;
      }

    // Status case - load limits, format status, and output to stdout, exit with code 0 on success or 1 on failure.
    case "status":
      try {
        const output = formatStatus(await getLimits());
        stdout(output);
        return 0;
      } catch {
        stderr(operationFailure("status"));
        return 1;
      }

    // Limits JSON case - load limits, format as JSON, and output to stdout, exit with code 0 on success or 1 on failure.
    case "limits-json":
      try {
        const output = formatJson(toCodexLimitsDto(await getLimits()));
        stdout(output);
        return 0;
      } catch {
        stderr(operationFailure("status"));
        return 1;
      }

    // Coupons case - load reset coupons, format output, and output to stdout, exit with code 0 on success or 1 on failure.
    case "coupons":
      try {
        const result = await getCoupons();
        const output = command.json
          ? formatJson(toCouponSummaryDto(result))
          : formatCoupons(result);
        stdout(output);
        return 0;
      } catch {
        stderr(operationFailure("coupons"));
        return 1;
      }
  }
}

export {getHelpText};

/**
 * Renders the default TUI (Text User Interface) for displaying Codex limits.
 * @param result - The Codex limits result to render in the TUI.
 * @returns - A promise that resolves when the TUI rendering is complete.
 * @throws - Any error that occurs during TUI rendering.
 */
async function renderDefaultTui(result: CodexLimitsResult): Promise<void> {
  const {renderApp} = await import("../tui/app");
  await renderApp(result);
}

/**
 * Writes text to the standard output (stdout).
 * @param text - The text to write to stdout.
 */
function writeStdout(text: string): void {
  process.stdout.write(text);
}

/**
 * Writes text to the standard error (stderr).
 * @param text - The text to write to stderr.
 */
function writeStderr(text: string): void {
  process.stderr.write(text);
}
