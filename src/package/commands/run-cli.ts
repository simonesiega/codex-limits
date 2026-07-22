import {createCommandRegistry} from "@/package/commands/command-registry";
import {getCommandSafetyViolation} from "@/package/commands/command-safety";
import {formatHelp} from "@/package/commands/help";
import {parseCliArguments} from "@/package/commands/parser";
import {sanitizePublicErrorMessage} from "@/package/commands/safe-error";
import {
  createCliRuntime,
  type CliRuntime,
  type CliRuntimeOverrides,
} from "@/package/commands/runtime";

/** Routes one invocation through the shared registry and returns its process exit code. */
export async function runCli(
  args: readonly string[],
  overrides: CliRuntimeOverrides = {}
): Promise<number> {
  const runtime = createCliRuntime(overrides);
  const registry = createCommandRegistry(runtime);
  const parsed = parseCliArguments(registry, args);

  switch (parsed.kind) {
    case "help":
      runtime.io.stdout(formatHelp(registry, parsed.subject));
      return 0;
    case "version":
      runtime.io.stdout(`${runtime.packageInfo.version}\n`);
      return 0;
    case "error":
      runtime.io.stderr(
        `${sanitizePublicErrorMessage(parsed.error.message, "Invalid command input.")}\n\n${formatHelp(registry, parsed.subject)}`
      );
      return 1;
    case "command": {
      const safetyViolation = getCommandSafetyViolation(parsed.command, parsed.values);
      if (safetyViolation) {
        runtime.io.stderr(`${safetyViolation}\n\n${formatHelp(registry, parsed.command)}`);
        return 1;
      }
      try {
        return await parsed.command.execute(parsed.values);
      } catch {
        let failureMessage = "Command failed.";
        try {
          failureMessage =
            typeof parsed.command.failureMessage === "function"
              ? parsed.command.failureMessage(parsed.values)
              : parsed.command.failureMessage;
        } catch {
          // Failure reporting must remain deterministic even if dynamic command metadata fails.
        }
        runtime.io.stderr(
          `codex-limits: ${sanitizePublicErrorMessage(failureMessage, "Command failed.")}\n`
        );
        return 1;
      }
    }
  }
}

/** Returns root help for callers that previously imported it from the router. */
export function getHelpText(): string {
  const runtime = createCliRuntime();
  return formatHelp(createCommandRegistry(runtime));
}

export type {CliRuntime, CliRuntimeOverrides};
