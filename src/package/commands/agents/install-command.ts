import type {AgentIntegration} from "@/agents";
import {
  hasOption,
  type LocalWriteCommandDefinition,
  type OptionDefinition,
} from "@/package/commands/command";
import {
  getAgentInstallSelection,
  installAgentIntegrations,
} from "@/package/commands/agents/install";
import type {CliIo} from "@/package/commands/runtime";

const ALL_OPTION_KEY = "agents.install.all";

interface AgentsInstallCommandDependencies {
  io: CliIo;
  integrations: readonly AgentIntegration[];
}

/** Creates the scalable agent installation subcommand. */
export function createAgentsInstallCommand(
  dependencies: AgentsInstallCommandDependencies
): LocalWriteCommandDefinition {
  const ids = dependencies.integrations.map((integration) => integration.id);
  const allOption: OptionDefinition = {
    key: ALL_OPTION_KEY,
    long: "--all",
    description: "Install every supported integration",
    kind: "boolean",
  };

  return {
    id: "agents.install",
    path: ["agents", "install"],
    description: "Install optional agent integrations",
    usage: [
      "codex-limits agents install",
      "codex-limits agents install <agent...>",
      "codex-limits agents install --all",
    ],
    options: [allOption],
    positionals: [
      {
        name: "agent",
        description: `Supported integration ID${ids.length > 0 ? ` (${ids.join(", ")})` : ""}`,
        variadic: true,
        choices: ids,
      },
    ],
    safety: "local-write",
    safetyNote: "Writes only the selected agent configuration and never modifies local Codex data.",
    failureMessage: "Could not install agent integrations.",
    validate(values) {
      if (hasOption(values, ALL_OPTION_KEY) && values.positionals.length > 0) {
        return {
          code: "conflicting-options",
          message: "Option --all cannot be combined with agent names.",
        };
      }
      const uniqueIds = new Set(values.positionals);
      return uniqueIds.size === values.positionals.length
        ? null
        : {
            code: "invalid-positional",
            message: "Agent integration names cannot be repeated.",
          };
    },
    execute(values) {
      const selection = getAgentInstallSelection(
        hasOption(values, ALL_OPTION_KEY),
        values.positionals,
        ids
      );
      const firstId = ids[0];
      return installAgentIntegrations(
        selection,
        {
          invocation: "codex-limits agents install",
          explicitExample: firstId
            ? `codex-limits agents install ${firstId}`
            : "codex-limits agents install --all",
        },
        dependencies
      );
    },
  };
}
