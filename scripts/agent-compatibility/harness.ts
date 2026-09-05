import {spawn, type ChildProcess, type ChildProcessWithoutNullStreams} from "node:child_process";
import {basename, join} from "node:path";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface ProcessFailureMonitor {
  promise: Promise<never>;
  dispose: () => void;
}

const MAX_SUBPROCESS_OUTPUT_CHARACTERS = 1_000_000;
const SETUP_TIMEOUT_MS = 120_000;

/** Shared bounded process and diagnostic utilities for real-host compatibility probes. */
export class CompatibilityHarness {
  constructor(private readonly temporaryRoot: string) {}

  appendBounded(current: string, addition: string): string {
    return `${current}${addition}`.slice(-MAX_SUBPROCESS_OUTPUT_CHARACTERS);
  }

  boundedText(value: string, maxLength = 4_000): string {
    return value.replaceAll(this.temporaryRoot, "<temporary>").trim().slice(-maxLength);
  }

  safeErrorMessage(error: unknown): string {
    return this.boundedText(error instanceof Error ? error.message : String(error));
  }

  commandFailureDetail(result: CommandResult): string {
    if (result.timedOut) {
      return `timed out after ${SETUP_TIMEOUT_MS}ms`;
    }
    return (
      [this.boundedText(result.stderr), this.boundedText(result.stdout)]
        .filter(Boolean)
        .join(" | ") || `exit code ${result.exitCode}`
    );
  }

  monitorProcessFailure(
    host: ChildProcessWithoutNullStreams,
    context: string
  ): ProcessFailureMonitor {
    let rejectFailure: (error: Error) => void = () => undefined;
    let failed = false;
    const promise = new Promise<never>((_resolve, reject) => {
      rejectFailure = reject;
    });
    void promise.catch(() => undefined);

    const fail = (error: unknown): void => {
      if (failed) {
        return;
      }
      failed = true;
      rejectFailure(new Error(`${context}: ${this.safeErrorMessage(error)}`));
    };
    host.once("error", fail);
    host.stdin.once("error", fail);

    return {
      promise,
      dispose: () => {
        host.off("error", fail);
        host.stdin.off("error", fail);
      },
    };
  }

  writeProcessInput(host: ChildProcessWithoutNullStreams, value: string): Promise<void> {
    return new Promise((resolveWrite, reject) => {
      host.stdin.write(value, (error?: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolveWrite();
        }
      });
    });
  }

  async terminate(host: ChildProcess, processGroup: boolean): Promise<void> {
    if (host.exitCode !== null || host.signalCode !== null) {
      return;
    }

    await new Promise<void>((resolveExit) => {
      let settled = false;
      let forceTimer: ReturnType<typeof setTimeout> | undefined;
      let hardTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (forceTimer) {
          clearTimeout(forceTimer);
        }
        if (hardTimer) {
          clearTimeout(hardTimer);
        }
        host.off("exit", finish);
        host.off("close", finish);
        resolveExit();
      };

      host.once("exit", finish);
      host.once("close", finish);
      if (host.exitCode !== null || host.signalCode !== null) {
        finish();
        return;
      }

      try {
        host.stdin?.end();
      } catch {
        // The input stream may already be closed while process termination is still pending.
      }
      this.signalProcess(host, "SIGTERM", processGroup);
      forceTimer = setTimeout(() => this.signalProcess(host, "SIGKILL", processGroup), 2_000);
      hardTimer = setTimeout(finish, 4_000);
    });
  }

  run(command: string, args: string[], cwd: string, environment: NodeJS.ProcessEnv): Promise<void> {
    return this.runResult(command, args, cwd, environment).then((result) => {
      if (!result.timedOut && result.exitCode === 0) {
        return;
      }
      const detail = [this.boundedText(result.stderr), this.boundedText(result.stdout)]
        .filter(Boolean)
        .join(" | ");
      const reason = result.timedOut ? `timed out after ${SETUP_TIMEOUT_MS}ms` : "failed";
      throw new Error(
        `${basename(command)} ${reason} during compatibility setup${detail ? `: ${detail}` : "."}`
      );
    });
  }

  runResult(
    command: string,
    args: string[],
    cwd: string,
    environment: NodeJS.ProcessEnv,
    timeoutMs = SETUP_TIMEOUT_MS
  ): Promise<CommandResult> {
    return new Promise((resolveResult, reject) => {
      const useProcessGroup = process.platform !== "win32";
      const child = spawn(command, args, {
        cwd,
        env: environment,
        detached: useProcessGroup,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        void this.terminate(child, useProcessGroup).then(() => finish(child.exitCode ?? 1));
      }, timeoutMs);

      const cleanup = (): void => {
        clearTimeout(timeout);
        child.stdout.off("data", onStdout);
        child.stderr.off("data", onStderr);
        child.off("error", onError);
        child.off("close", finish);
      };
      const finish = (exitCode: number | null): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolveResult({exitCode: exitCode ?? 1, stdout, stderr, timedOut});
      };
      const onError = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error(`Could not start ${basename(command)}: ${this.safeErrorMessage(error)}`));
      };
      const onStdout = (chunk: Buffer): void => {
        stdout = this.appendBounded(stdout, chunk.toString("utf8"));
      };
      const onStderr = (chunk: Buffer): void => {
        stderr = this.appendBounded(stderr, chunk.toString("utf8"));
      };

      child.stdout.on("data", onStdout);
      child.stderr.on("data", onStderr);
      child.once("error", onError);
      child.once("close", finish);
    });
  }

  private signalProcess(host: ChildProcess, signal: NodeJS.Signals, processGroup: boolean): void {
    try {
      if (processGroup && host.pid !== undefined) {
        process.kill(-host.pid, signal);
      } else {
        host.kill(signal);
      }
    } catch {
      try {
        host.kill(signal);
      } catch {
        // The process exited between the exitCode check and signal delivery.
      }
    }
  }
}

export function executablePath(prefix: string, name: string): string {
  return join(prefix, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
}

export function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
