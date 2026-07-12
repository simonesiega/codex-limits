/** Public root-module contract loaded by OpenCode. */
export interface CodexLimitsTuiPluginModule {
  id: "codex-limits";
  tui: (api: unknown) => void | Promise<void>;
}
declare const plugin: CodexLimitsTuiPluginModule;
export default plugin;
export declare const tui: CodexLimitsTuiPluginModule["tui"];
