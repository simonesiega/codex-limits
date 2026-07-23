import startCopilotPlugin, {
  COPILOT_EXTENSION_MARKER as copilotExtensionMarker,
} from "@/agents/copilot/plugin";
import {exposeAgentHost} from "@/agents/shared/host-entry";

/** Public host-module contract exported from the Copilot-specific package subpath. */
export type CodexLimitsCopilotExtension = () => Promise<void>;

const plugin = exposeAgentHost<CodexLimitsCopilotExtension>(startCopilotPlugin);

export const COPILOT_EXTENSION_MARKER: "codex-limits-copilot-extension-v1" = copilotExtensionMarker;
export const startCopilotExtension = plugin;
export default plugin;
