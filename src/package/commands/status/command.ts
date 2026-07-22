import type {ReadOnlyCommandDefinition} from "@/package/commands/command";
import type {CliIo, UsageServices} from "@/package/commands/runtime";
import {formatStatus} from "@/package/commands/status/format";

interface StatusCommandDependencies {
  io: Pick<CliIo, "stdout">;
  usage: UsageServices;
}

/** Creates the plain-text status command with read-only capabilities only. */
export function createStatusCommand(
  dependencies: StatusCommandDependencies
): ReadOnlyCommandDefinition {
  return {
    id: "status",
    path: ["status"],
    description: "Print a non-interactive usage summary",
    usage: ["codex-limits status"],
    safety: "read-only",
    safetyNote: "Reads recognized Codex data without modifying local files or the account.",
    failureMessage: "Could not load Codex limits.",
    async execute() {
      const output = formatStatus(await dependencies.usage.loadLimits());
      dependencies.io.stdout(output);
      return 0;
    },
  };
}
