#!/usr/bin/env node
import {runCli} from "./commands/run-cli";

/**
 * Starts the command-line program and applies its exit code.
 *
 * @returns A promise that resolves after the CLI has finished writing output.
 */
async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv.slice(2));
}

/**
 * Handles unexpected top-level errors without printing raw stack traces.
 *
 * @param error - Unknown error thrown while running the CLI.
 * @returns Nothing.
 */
function handleFatalError(error: unknown): void {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  process.stderr.write(`codex-limits: ${message}\n`);
  process.exitCode = 1;
}

main().catch(handleFatalError);
