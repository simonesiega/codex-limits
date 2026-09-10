/**
 * @fileoverview Bounded subprocess support shared by packed-package validation probes.
 */
import {spawn} from "node:child_process";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunCommandOptions {
  /** Closes the parent read end immediately to exercise broken-pipe handling. */
  closeStdout?: boolean;
  /** Maximum combined standard output and standard error captured from the command. */
  maxOutputBytes?: number;
  /** Terminates and rejects when a smoke command does not exit within this duration. */
  timeoutMs?: number;
}

const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

/** Runs a validation subprocess with bounded runtime and captured output. */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd, env, stdio: ["ignore", "pipe", "pipe"]});
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    let capturedBytes = 0;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const stop = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGKILL");
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      reject(error);
    };
    const capture = (chunks: Buffer[], chunk: Buffer): void => {
      if (settled) {
        return;
      }
      capturedBytes += chunk.length;
      if (capturedBytes > maxOutputBytes) {
        stop(new Error(`${command} exceeded the package-validation output limit.`));
        return;
      }
      chunks.push(chunk);
    };
    timeout = setTimeout(
      () => stop(new Error(`${command} timed out during package validation.`)),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    if (options.closeStdout) {
      child.stdout.destroy();
    } else {
      child.stdout.on("data", (chunk: Buffer) => capture(stdout, chunk));
    }
    child.stderr.on("data", (chunk: Buffer) => capture(stderr, chunk));
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}
