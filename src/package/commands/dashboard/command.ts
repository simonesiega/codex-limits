import {
  getOutputFormat,
  JSON_OPTION,
  type ReadOnlyCommandDefinition,
} from "@/package/commands/command";
import {formatJson} from "@/package/commands/format-json";
import {toCodexLimitsDto} from "@/package/commands/public-dto";
import type {CliIo, UiServices, UsageServices} from "@/package/commands/runtime";

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
    usage: ["codex-limits", "codex-limits --json"],
    options: [JSON_OPTION],
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
      return 0;
    },
  };
}
