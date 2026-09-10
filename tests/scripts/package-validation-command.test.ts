/**
 * @fileoverview Behavioral coverage for bounded packed-package subprocess execution.
 */
import {expect, test} from "bun:test";
import {runCommand, type RunCommandOptions} from "@root/scripts/package-validation/command";

interface CommandCase {
  label: string;
  command?: string;
  source?: string;
  options?: RunCommandOptions;
  expectedOutput?: string;
  expectedStderr?: string;
  expectedError?: string;
}

test("package-validation commands bound runtime and captured output", async () => {
  const cases: CommandCase[] = [
    {
      label: "captures successful output",
      source: 'process.stdout.write("ready"); process.stderr.write("notice");',
      expectedOutput: "ready",
      expectedStderr: "notice",
    },
    {
      label: "permits the caller to close standard output",
      source: "process.exitCode = 0;",
      options: {closeStdout: true},
    },
    {
      label: "rejects excessive output",
      source: 'process.stdout.write("x".repeat(1_024));',
      options: {maxOutputBytes: 128},
      expectedError: "exceeded the package-validation output limit",
    },
    {
      label: "rejects a stalled command",
      source: "setInterval(() => undefined, 1_000);",
      options: {timeoutMs: 100},
      expectedError: "timed out during package validation",
    },
    {
      label: "rejects an unavailable executable",
      command: "codex-limits-validation-command-does-not-exist",
      expectedError: "codex-limits-validation-command-does-not-exist",
    },
  ];

  for (const item of cases) {
    const result = runCommand(
      item.command ?? process.execPath,
      item.source ? ["--eval", item.source] : [],
      process.cwd(),
      process.env,
      {
        timeoutMs: 5_000,
        ...item.options,
      }
    );

    if (item.expectedError) {
      await expect(result, item.label).rejects.toThrow(item.expectedError);
      continue;
    }

    expect(await result, item.label).toEqual({
      exitCode: 0,
      stdout: item.expectedOutput ?? "",
      stderr: item.expectedStderr ?? "",
    });
  }
});
