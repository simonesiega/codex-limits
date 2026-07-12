import {installOpencodePlugin} from "./opencode/install";
import type {AgentIntegration} from "./types";

export {AgentInstallError} from "./types";
export type {AgentInstallResult, AgentIntegration} from "./types";

/**
 * The list of registered agent integrations
 * including their stable integration IDs, names, descriptions, and installation functions.
 */
export const AGENT_INTEGRATIONS: AgentIntegration[] = [
  {
    id: "opencode",
    name: "opencode",
    description: "Add the /codex-limits command to OpenCode.",
    install: installOpencodePlugin,
  },
];

/**
 * Finds an agent integration by its stable integration ID.
 * @param id - Identifier of the agent integration to find.
 * @returns - The agent integration with the specified ID, or undefined if not found.
 */
export function findAgentIntegration(id: string): AgentIntegration | undefined {
  return AGENT_INTEGRATIONS.find((integration) => integration.id === id);
}
