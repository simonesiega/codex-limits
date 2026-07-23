import {inspectCopilotIntegration, installCopilotIntegration} from "@/agents/copilot/install";
import type {AgentIntegration} from "@/agents/types";

/** GitHub Copilot CLI adapter metadata and lifecycle operations used by shared commands. */
export const copilotIntegration: AgentIntegration = {
  id: "copilot",
  displayName: "GitHub Copilot CLI",
  description: "Add the /codex-limits command to GitHub Copilot CLI.",
  environment: [
    {
      name: "COPILOT_HOME",
      description: "Override GitHub Copilot CLI's user configuration directory",
    },
  ],
  install: installCopilotIntegration,
  inspect: inspectCopilotIntegration,
};
