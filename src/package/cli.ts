#!/usr/bin/env node
import {runCli} from "@/package/commands/run-cli";

async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv.slice(2));
}

function handleFatalError(): void {
  process.stderr.write("codex-limits: Unexpected error.\n");
  process.exitCode = 1;
}

main().catch(handleFatalError);
