import {inspectPiIntegration, installPiIntegration} from "@/agents/pi/install";
import type {AgentIntegration} from "@/agents/types";

/** Pi adapter metadata and lifecycle operations used by shared commands. */
export const piIntegration: AgentIntegration = {
  id: "pi",
  displayName: "pi",
  description: "Add the /codex-limits command to pi.",
  environment: [
    {
      name: "PI_CODING_AGENT_DIR",
      description: "Override pi's global agent configuration directory",
    },
  ],
  install: installPiIntegration,
  inspect: inspectPiIntegration,
};
