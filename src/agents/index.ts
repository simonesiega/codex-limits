import {installOpencodePlugin} from "@/agents/opencode/install";
import type {AgentIntegration} from "@/agents/types";

export {AgentInstallError} from "@/agents/types";
export type {AgentInstallResult, AgentIntegration} from "@/agents/types";

/** Optional integrations available through the agent-management commands. */
export const AGENT_INTEGRATIONS: readonly AgentIntegration[] = [
  {
    id: "opencode",
    name: "opencode",
    description: "Add the /codex-limits command to OpenCode.",
    install: installOpencodePlugin,
  },
];
