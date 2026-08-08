import {installAgentIntegrations} from "@/package/commands/agents/install";
import {
  createAgentsLifecycleCommand,
  type AgentsLifecycleCommandDependencies,
} from "@/package/commands/agents/lifecycle-command";
import type {LocalWriteCommandDefinition} from "@/package/commands/command";

/** Creates the scalable agent installation subcommand. */
export function createAgentsInstallCommand(
  dependencies: AgentsLifecycleCommandDependencies
): LocalWriteCommandDefinition {
  return createAgentsLifecycleCommand(
    {
      action: "install",
      description: "Install optional agent integrations",
      safetyNote:
        "Writes only the selected agent configuration and never modifies local Codex data.",
      failureMessage: "Could not install agent integrations.",
      execute: installAgentIntegrations,
    },
    dependencies
  );
}
