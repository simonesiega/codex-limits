/**
 * @fileoverview CLI command-layer support for command. It translates validated command input and shared core results into stable terminal or JSON behavior.
 */
import {
  getOutputFormat,
  JSON_OPTION,
  type ReadOnlyCommandDefinition,
} from "@/package/commands/command";
import {formatJson} from "@/package/commands/format-json";
import {toCodexLimitsDto} from "@/package/commands/public-dto";
import type {CliIo, UiServices, UsageServices} from "@/package/commands/runtime";
import {
  getUsageThresholdExitCode,
  USAGE_THRESHOLD_OPTION,
  validateUsageThresholds,
} from "@/package/commands/usage-threshold";

interface DashboardCommandDependencies {
  io: Pick<CliIo, "stdout">;
  usage: UsageServices;
  ui: UiServices;
}

/** Creates the default dashboard command with read-only capabilities only. */
export function createDashboardCommand(
  dependencies: DashboardCommandDependencies
): ReadOnlyCommandDefinition {
  return {
    id: "dashboard",
    path: [],
    description: "Open the interactive terminal dashboard",
    usage: [
      "codex-limits",
      "codex-limits --json",
      "codex-limits --json --threshold <window=percent>",
    ],
    options: [JSON_OPTION, USAGE_THRESHOLD_OPTION],
    validate(values) {
      const thresholdIssue = validateUsageThresholds(values);
      if (thresholdIssue) {
        return thresholdIssue;
      }
      return values.options[USAGE_THRESHOLD_OPTION.key] !== undefined &&
        getOutputFormat(values) !== "json"
        ? {
            code: "conflicting-options",
            message: "Option --threshold requires --json on the root command.",
          }
        : null;
    },
    safety: "read-only",
    safetyNote: "Reads recognized Codex data without modifying local files or the account.",
    failureMessage: (values) =>
      getOutputFormat(values) === "json"
        ? "Could not load Codex limits."
        : "Could not open the dashboard.",
    async execute(values) {
      const result = await dependencies.usage.loadLimits();
      if (getOutputFormat(values) === "json") {
        dependencies.io.stdout(formatJson(toCodexLimitsDto(result)));
      } else {
        await dependencies.ui.renderDashboard(result);
      }
      return getUsageThresholdExitCode(result.windows, values);
    },
  };
}
