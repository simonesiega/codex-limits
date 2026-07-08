export interface CodexLimitsTuiPluginModule {
  id: "codex-limits";
  tui: (api: unknown) => void | Promise<void>;
}

declare const plugin: CodexLimitsTuiPluginModule;

export default plugin;
export const tui: CodexLimitsTuiPluginModule["tui"];
