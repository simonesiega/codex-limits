import type {ReadOnlyCommandDefinition} from "@/package/commands/command";
import type {CliIo, UsageServices} from "@/package/commands/runtime";
import {formatStatus} from "@/package/commands/status/format";
import {
  getUsageThresholdExitCode,
  USAGE_THRESHOLD_OPTION,
  validateUsageThresholds,
} from "@/package/commands/usage-threshold";

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
    usage: ["codex-limits status", "codex-limits status --threshold <window=percent>"],
    options: [USAGE_THRESHOLD_OPTION],
    validate: validateUsageThresholds,
    safety: "read-only",
    safetyNote: "Reads recognized Codex data without modifying local files or the account.",
    failureMessage: "Could not load Codex limits.",
    async execute(values) {
      const result = await dependencies.usage.loadLimits();
      dependencies.io.stdout(formatStatus(result));
      return getUsageThresholdExitCode(result.windows, values);
    },
  };
}
