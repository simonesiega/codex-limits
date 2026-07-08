import {installOpencodePlugin} from "./opencode/install";

export interface AgentIntegration {
  /** Stable integration id used by the init command. */
  id: string;
  /** Human-readable integration name. */
  name: string;
  /** Short explanation shown during setup. */
  description: string;
  /** Installs or enables the integration. */
  install: () => Promise<{changed: boolean; configPaths?: string[]}>;
}

export const AGENT_INTEGRATIONS: AgentIntegration[] = [
  {
    id: "opencode",
    name: "opencode",
    description: "Enable /codex-limits in every opencode TUI without calling the LLM.",
    install: installOpencodePlugin,
  },
];

export function findAgentIntegration(id: string): AgentIntegration | undefined {
  return AGENT_INTEGRATIONS.find((integration) => integration.id === id);
}
