#!/usr/bin/env node
/**
 * @fileoverview Node.js CLI entry point. It installs safe pipe handling, delegates argument processing to the command runtime, and converts the resulting status into a process exit code.
 */
import {runCli} from "@/package/commands/run-cli";

async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv.slice(2));
}

/** Treats a closed output pipe as normal termination instead of exposing a runtime stack trace. */
function handleStdoutError(error: unknown): never {
  // A closed pipeline is successful consumption; every other output failure remains fatal.
  const isBrokenPipe = error instanceof Error && "code" in error && error.code === "EPIPE";
  process.exit(isBrokenPipe ? 0 : 1);
}

/** Terminates quietly when the diagnostic stream itself is no longer writable. */
function handleStderrError(): never {
  process.exit(1);
}

/** Emits only the fixed top-level failure message for unexpected startup errors. */
function handleFatalError(): void {
  process.stderr.write("codex-limits: Unexpected error.\n");
  process.exitCode = 1;
}

process.stdout.on("error", handleStdoutError);
process.stderr.on("error", handleStderrError);

main().catch(handleFatalError);
