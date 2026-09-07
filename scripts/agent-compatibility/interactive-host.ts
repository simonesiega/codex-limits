/**
 * @fileoverview Real-host compatibility support for interactive host. This module keeps external process behavior bounded and reports sanitized diagnostics to the compatibility harness.
 */
import {spawn} from "node:child_process";
import {basename} from "node:path";
import type {CompatibilityHarness} from "./harness";

interface InteractiveHostProbeOptions {
  harness: CompatibilityHarness;
  command: string;
  args: string[];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  readiness: RegExp;
  expectedOutput: RegExp;
  registryRequests?: string[];
  startupConfirmation?: RegExp;
  useTmux?: boolean;
}

const INTERACTIVE_READY_STABILIZATION_MS = 500;
const INTERACTIVE_READINESS_FALLBACK_MS = 15_000;

/** Exercises a slash command through a real interactive terminal host. */
export async function probeInteractiveHost({
  harness,
  command,
  args,
  cwd,
  environment,
  readiness,
  expectedOutput,
  registryRequests,
  startupConfirmation,
  useTmux = false,
}: InteractiveHostProbeOptions): Promise<void> {
  const commandLine = [command, ...args].map(shellQuote).join(" ");
  const tmuxSocket = `codex-limits-${process.pid}`;
  const interactiveCommandLine = useTmux
    ? [
        "tmux",
        "-L",
        tmuxSocket,
        "-f",
        "/dev/null",
        "new-session",
        "-x",
        "100",
        "-y",
        "32",
        commandLine,
      ]
        .map(shellQuote)
        .join(" ")
    : commandLine;
  const host = spawn(
    "script",
    ["--quiet", "--return", "--flush", "--command", interactiveCommandLine, "/dev/null"],
    {cwd, env: environment, detached: true, stdio: ["pipe", "pipe", "pipe"]}
  );
  const failure = harness.monitorProcessFailure(
    host,
    `Could not start interactive host ${basename(command)}`
  );

  let output = "";
  let readinessOutput = "";
  let startupOutput = "";
  let commandTypedOutput = "";
  let postSubmissionOutput = "";
  let diagnosticTail = "";
  let hostDiagnostics = "";
  let commandTyped = false;
  let commandSubmitted = false;
  const result = new Promise<void>((resolveProbe, reject) => {
    let settled = false;
    let startupConfirmed = startupConfirmation === undefined;
    let readinessObserved = false;
    let commandTypingTimer: ReturnType<typeof setTimeout> | undefined;
    let submitFallback: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      const requests = registryRequests?.length
        ? ` Registry requests: ${registryRequests.join(", ")}.`
        : "";
      const commandState = commandSubmitted
        ? "command submitted"
        : commandTyped
          ? "command typed"
          : "command not typed";
      finish(
        new Error(
          `Timed out waiting for the real host to dispatch /codex-limits (${commandState}).${requests}${hostDiagnostics ? ` Host diagnostics: ${harness.boundedText(hostDiagnostics)}` : ""} Startup output: ${boundedTerminalOutput(harness, startupOutput)} Command-entry output: ${boundedTerminalOutput(harness, commandTypedOutput)} Post-submission output: ${boundedTerminalOutput(harness, postSubmissionOutput)}`
        )
      );
    }, 45_000);

    const cleanup = (): void => {
      clearTimeout(timeout);
      if (commandTypingTimer) {
        clearTimeout(commandTypingTimer);
      }
      if (submitFallback) {
        clearTimeout(submitFallback);
      }
      host.stdout.off("data", inspect);
      host.stderr.off("data", inspect);
      host.off("exit", onExit);
    };
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
      } else {
        resolveProbe();
      }
    };
    const submitCommand = (): void => {
      if (!commandTyped || commandSubmitted || settled) {
        return;
      }
      postSubmissionOutput = "";
      commandSubmitted = true;
      if (submitFallback) {
        clearTimeout(submitFallback);
        submitFallback = undefined;
      }
      void harness
        .writeProcessInput(host, "\r")
        .catch((error: unknown) =>
          finish(
            new Error(
              `Could not submit /codex-limits to the real host: ${harness.safeErrorMessage(error)}`
            )
          )
        );
    };
    const typeCommand = (): void => {
      if (commandTyped || settled) {
        return;
      }
      commandTyped = true;
      if (commandTypingTimer) {
        clearTimeout(commandTypingTimer);
        commandTypingTimer = undefined;
      }
      void harness
        .writeProcessInput(host, "/codex-limits")
        .then(() => {
          if (!settled && !commandSubmitted) {
            // Interactive hosts expose no shared completion event, so submit after a bounded
            // fallback only when the rendered command echo is unavailable.
            submitFallback = setTimeout(submitCommand, 2_000);
          }
        })
        .catch((error: unknown) =>
          finish(
            new Error(
              `Could not type /codex-limits in the real host: ${harness.safeErrorMessage(error)}`
            )
          )
        );
    };
    const inspect = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      output = harness.appendBounded(output, text);
      diagnosticTail = `${diagnosticTail}${text}`.slice(-20_000);
      const plainDiagnosticTail = stripTerminalControls(diagnosticTail);
      const diagnosticIndex = plainDiagnosticTail.lastIndexOf("[tui.plugin]");
      if (diagnosticIndex >= 0) {
        hostDiagnostics = plainDiagnosticTail.slice(diagnosticIndex);
      }
      if (commandSubmitted) {
        postSubmissionOutput = harness.appendBounded(postSubmissionOutput, text);
      } else if (commandTyped) {
        commandTypedOutput = harness.appendBounded(commandTypedOutput, text);
      } else {
        startupOutput = harness.appendBounded(startupOutput, text);
      }
      const plainOutput = stripTerminalControls(output);
      const plainPostSubmissionOutput = stripTerminalControls(postSubmissionOutput);
      if (!startupConfirmed) {
        if (startupConfirmation?.test(plainOutput)) {
          startupConfirmed = true;
          readinessOutput = "";
          void harness
            .writeProcessInput(host, "\r")
            .catch((error: unknown) =>
              finish(
                new Error(
                  `Could not confirm the isolated host workspace: ${harness.safeErrorMessage(error)}`
                )
              )
            );
        }
      } else {
        readinessOutput = harness.appendBounded(readinessOutput, text);
      }
      const plainReadinessOutput = stripTerminalControls(readinessOutput);
      if (
        startupConfirmed &&
        !commandTyped &&
        !readinessObserved &&
        (readiness.test(readinessOutput) || readiness.test(plainReadinessOutput))
      ) {
        readinessObserved = true;
        if (commandTypingTimer) {
          clearTimeout(commandTypingTimer);
        }
        // Allow the completed UI frame to establish input focus, then act on readiness promptly.
        commandTypingTimer = setTimeout(typeCommand, INTERACTIVE_READY_STABILIZATION_MS);
      } else if (startupConfirmed && !commandTyped && !commandTypingTimer) {
        // Input without a readiness signal is a last resort for hosts whose UI wording changed.
        commandTypingTimer = setTimeout(typeCommand, INTERACTIVE_READINESS_FALLBACK_MS);
      }
      if (
        commandTyped &&
        !commandSubmitted &&
        /\/codex-limits/i.test(stripTerminalControls(commandTypedOutput))
      ) {
        submitCommand();
      }
      if (commandSubmitted && expectedOutput.test(plainPostSubmissionOutput)) {
        finish();
      }
    };
    const onExit = (code: number | null): void => {
      finish(
        new Error(
          `The real host exited with code ${code ?? 1}. Output: ${boundedTerminalOutput(harness, output)}`
        )
      );
    };

    host.stdout.on("data", inspect);
    host.stderr.on("data", inspect);
    host.on("exit", onExit);
    void failure.promise.catch((error: Error) => finish(error));
  });

  try {
    await result;
  } finally {
    try {
      await harness.terminate(host, true);
      if (useTmux) {
        await stopTmux(harness, tmuxSocket, cwd, environment);
      }
    } finally {
      failure.dispose();
    }
  }
}

async function stopTmux(
  harness: CompatibilityHarness,
  socket: string,
  cwd: string,
  environment: NodeJS.ProcessEnv
): Promise<void> {
  const result = await harness
    .runResult("tmux", ["-L", socket, "kill-server"], cwd, environment, 5_000)
    .catch(() => undefined);
  if (result?.timedOut) {
    throw new Error("Timed out while terminating the real host's tmux server.");
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function stripTerminalControls(value: string): string {
  return value
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1bP[\s\S]*?\x1b\\/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function boundedTerminalOutput(harness: CompatibilityHarness, output: string): string {
  return harness.boundedText(stripTerminalControls(output));
}
