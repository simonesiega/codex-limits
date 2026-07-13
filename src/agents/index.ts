import {installOpencodePlugin} from "@/agents/opencode/install";
import type {AgentIntegration} from "@/agents/types";

export {AgentInstallError} from "@/agents/types";
export type {AgentInstallResult, AgentIntegration} from "@/agents/types";

/** Optional agent integrations available through `codex-limits init`. */
export const AGENT_INTEGRATIONS: AgentIntegration[] = [
  {
    id: "opencode",
    name: "opencode",
    description: "Add the /codex-limits command to OpenCode.",
    install: installOpencodePlugin,
  },
];
