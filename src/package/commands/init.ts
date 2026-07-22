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

const ALL_OPTION_KEY = "init.all";
const AGENT_OPTION_PREFIX = "init.agent.";
const ALL_CONFLICT_MESSAGE = "Init option --all cannot be combined with integration options.";

interface InitCommandDependencies {
  io: CliIo;
  integrations: readonly AgentIntegration[];
}

/** Creates the backward-compatible `init` facade over agent installation. */
export function createInitCommand(
  dependencies: InitCommandDependencies
): LocalWriteCommandDefinition {
  const agentOptions = dependencies.integrations.map<OptionDefinition>((integration) => ({
    key: `${AGENT_OPTION_PREFIX}${integration.id}`,
    long: `--${integration.id}`,
    description: `Install the ${integration.name} integration`,
    kind: "boolean",
    conflicts: [ALL_OPTION_KEY],
    conflictMessage: ALL_CONFLICT_MESSAGE,
  }));
  const allOption: OptionDefinition = {
    key: ALL_OPTION_KEY,
    long: "--all",
    description: "Install every supported integration",
    kind: "boolean",
    ...(agentOptions.length > 0
      ? {
          conflicts: agentOptions.map((option) => option.key),
          conflictMessage: ALL_CONFLICT_MESSAGE,
        }
      : {}),
  };

  return {
    id: "init",
    path: ["init"],
    compatibility: true,
    description: "Install optional agent integrations (compatibility command)",
    usage: [
      "codex-limits init",
      ...dependencies.integrations.map((integration) => `codex-limits init --${integration.id}`),
      "codex-limits init --all",
    ],
    options: [...agentOptions, allOption],
    safety: "local-write",
    safetyNote: "Writes only the selected agent configuration and never modifies local Codex data.",
    failureMessage: "Could not initialize agent integrations.",
    execute(values) {
      const selectedIds = dependencies.integrations
        .filter((integration) => hasOption(values, `${AGENT_OPTION_PREFIX}${integration.id}`))
        .map((integration) => integration.id);
      const selection = getAgentInstallSelection(
        hasOption(values, ALL_OPTION_KEY),
        selectedIds,
        dependencies.integrations.map((integration) => integration.id)
      );
      const firstId = dependencies.integrations[0]?.id;

      return installAgentIntegrations(
        selection,
        {
          invocation: "codex-limits init",
          explicitExample: firstId ? `codex-limits init --${firstId}` : "codex-limits init --all",
        },
        dependencies
      );
    },
  };
}
