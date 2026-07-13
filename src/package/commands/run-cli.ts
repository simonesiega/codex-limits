import {parseCommand} from "@/package/commands/cli-parser";
import {getHelpText} from "@/package/commands/cli-spec";
import {formatCoupons} from "@/package/commands/coupons";
import {formatJson} from "@/package/commands/format-json";
import {runInit} from "@/package/commands/init";
import {toCodexLimitsDto, toCouponSummaryDto} from "@/package/commands/public-dto";
import {operationFailure} from "@/package/commands/safe-error";
import {formatStatus} from "@/package/commands/status";
import {getResetCoupons} from "@/package/core/coupons/reset-coupons";
import {getCodexLimits} from "@/package/core/limits";
import type {CodexLimitsResult, CouponResult} from "@/package/core/types";
import {PACKAGE_VERSION} from "@/package/version";

type WriteOutput = (text: string) => void;
type RenderTui = (result: CodexLimitsResult) => Promise<void> | void;

export interface RunCliOptions {
  version?: string;
  stdout?: WriteOutput;
  stderr?: WriteOutput;
  getLimits?: () => Promise<CodexLimitsResult>;
  getCoupons?: () => Promise<CouponResult>;
  renderTui?: RenderTui;
}

/** Routes one invocation of the public CLI and returns its process exit code. */
export async function runCli(args: string[], options: RunCliOptions = {}): Promise<number> {
  const stdout = options.stdout ?? writeStdout;
  const stderr = options.stderr ?? writeStderr;
  const getLimits = options.getLimits ?? getCodexLimits;
  const getCoupons = options.getCoupons ?? getResetCoupons;
  const command = parseCommand(args);

  switch (command.kind) {
    case "help":
      stdout(getHelpText());
      return 0;
    case "version":
      stdout(`${options.version ?? PACKAGE_VERSION}\n`);
      return 0;
    case "invalid":
      stderr(`Unknown command or option: ${command.input}\n\n${getHelpText()}`);
      return 1;
    case "init":
      try {
        return await runInit(command.args, {stdout, stderr});
      } catch {
        stderr(operationFailure("init"));
        return 1;
      }
    case "dashboard":
      try {
        const result = await getLimits();
        await (options.renderTui ?? renderDefaultTui)(result);
        return 0;
      } catch {
        stderr(operationFailure("dashboard"));
        return 1;
      }
    case "status":
      return writeLoadedOutput(getLimits, formatStatus, "status", stdout, stderr);
    case "limits-json":
      return writeLoadedOutput(
        getLimits,
        (result) => formatJson(toCodexLimitsDto(result)),
        "status",
        stdout,
        stderr
      );
    case "coupons":
      return writeLoadedOutput(
        getCoupons,
        command.json
          ? (result) => formatJson(toCouponSummaryDto(result))
          : (result) => formatCoupons(result),
        "coupons",
        stdout,
        stderr
      );
  }
}

export {getHelpText};

/** Formats before writing so failed JSON serialization cannot produce partial stdout. */
async function writeLoadedOutput<T>(
  load: () => Promise<T>,
  format: (value: T) => string,
  operation: "coupons" | "status",
  stdout: WriteOutput,
  stderr: WriteOutput
): Promise<number> {
  try {
    const output = format(await load());
    stdout(output);
    return 0;
  } catch {
    stderr(operationFailure(operation));
    return 1;
  }
}

async function renderDefaultTui(result: CodexLimitsResult): Promise<void> {
  const {renderApp} = await import("@/package/tui/app");
  await renderApp(result);
}

function writeStdout(text: string): void {
  process.stdout.write(text);
}

function writeStderr(text: string): void {
  process.stderr.write(text);
}
