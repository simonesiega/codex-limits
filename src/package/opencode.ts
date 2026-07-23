import opencodePlugin from "@/agents/opencode/plugin";
import {exposeAgentHost} from "@/agents/shared/host-entry";

/** Public host-module contract exported from the OpenCode package entry points. */
export interface CodexLimitsTuiPluginModule {
  id: "codex-limits";
  tui: (api: unknown) => void | Promise<void>;
}

/** Agent-specific name for the original package-root contract. */
export type CodexLimitsOpencodeExtension = CodexLimitsTuiPluginModule;

const plugin = exposeAgentHost<CodexLimitsOpencodeExtension>(opencodePlugin);

export default plugin;
export const tui: CodexLimitsOpencodeExtension["tui"] = plugin.tui;
