import {inspectOpencodeIntegration, installOpencodeIntegration} from "@/agents/opencode/install";
import type {AgentIntegration} from "@/agents/types";

/** OpenCode adapter metadata and lifecycle operations used by shared commands. */
export const opencodeIntegration: AgentIntegration = {
  id: "opencode",
  displayName: "OpenCode",
  description: "Add the /codex-limits command to OpenCode.",
  install: installOpencodeIntegration,
  inspect: inspectOpencodeIntegration,
};
