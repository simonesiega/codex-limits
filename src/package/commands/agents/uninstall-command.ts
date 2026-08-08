import type {LocalWriteCommandDefinition} from "@/package/commands/command";
import {
  createAgentsLifecycleCommand,
  type AgentsLifecycleCommandDependencies,
} from "@/package/commands/agents/lifecycle-command";
import {uninstallAgentIntegrations} from "@/package/commands/agents/uninstall";

/** Creates the conservative agent uninstallation subcommand. */
export function createAgentsUninstallCommand(
  dependencies: AgentsLifecycleCommandDependencies
): LocalWriteCommandDefinition {
  return createAgentsLifecycleCommand(
    {
      action: "uninstall",
      description: "Safely uninstall optional agent integrations",
      safetyNote:
        "Removes only recognized Codex Limits integration configuration and never modifies local Codex data.",
      failureMessage: "Could not uninstall agent integrations.",
      execute: uninstallAgentIntegrations,
    },
    dependencies
  );
}
