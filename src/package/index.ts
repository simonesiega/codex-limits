import opencodePlugin from "../agents/opencode/plugin";

/** Public root-module contract loaded by OpenCode. */
export interface CodexLimitsTuiPluginModule {
  id: "codex-limits";
  tui: (api: unknown) => void | Promise<void>;
}

const plugin = opencodePlugin as unknown as CodexLimitsTuiPluginModule;

export default plugin;
export const tui: CodexLimitsTuiPluginModule["tui"] = plugin.tui;
