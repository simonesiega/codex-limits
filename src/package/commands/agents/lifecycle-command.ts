import type {AgentIntegration} from "@/agents";
import {
  hasOption,
  type LocalWriteCommandDefinition,
  type OptionDefinition,
} from "@/package/commands/command";
import {
  getAgentLifecycleSelection,
  type AgentLifecycleDependencies,
  type AgentLifecycleGuidance,
  type AgentLifecycleSelection,
} from "@/package/commands/agents/lifecycle";
import type {CliIo} from "@/package/commands/runtime";

type AgentLifecycleAction = "install" | "uninstall";

export interface AgentsLifecycleCommandDependencies {
  io: CliIo;
  integrations: readonly AgentIntegration[];
}

interface AgentsLifecycleCommandOptions {
  action: AgentLifecycleAction;
  description: string;
  safetyNote: string;
  failureMessage: string;
  execute: (
    selection: AgentLifecycleSelection,
    guidance: AgentLifecycleGuidance,
    dependencies: AgentLifecycleDependencies
  ) => Promise<number>;
}

/** Creates an agent lifecycle command with shared target parsing and validation. */
export function createAgentsLifecycleCommand(
  options: AgentsLifecycleCommandOptions,
  dependencies: AgentsLifecycleCommandDependencies
): LocalWriteCommandDefinition {
  const {action} = options;
  const ids = dependencies.integrations.map((integration) => integration.id);
  const allOptionKey = `agents.${action}.all`;
  const actionLabel = action === "install" ? "Install" : "Uninstall";
  const invocation = `codex-limits agents ${action}`;
  const allOption: OptionDefinition = {
    key: allOptionKey,
    long: "--all",
    description: `${actionLabel} every supported integration`,
    kind: "boolean",
  };

  return {
    id: `agents.${action}`,
    path: ["agents", action],
    description: options.description,
    usage: [invocation, `${invocation} <agent...>`, `${invocation} --all`],
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
    safetyNote: options.safetyNote,
    failureMessage: options.failureMessage,
    validate(values) {
      if (hasOption(values, allOptionKey) && values.positionals.length > 0) {
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
      const selection = getAgentLifecycleSelection(
        hasOption(values, allOptionKey),
        values.positionals,
        ids
      );
      const firstId = ids[0];
      return options.execute(
        selection,
        {
          invocation,
          explicitExample: firstId ? `${invocation} ${firstId}` : `${invocation} --all`,
        },
        dependencies
      );
    },
  };
}
