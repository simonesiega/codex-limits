/** Public host-module contract exported from the OpenCode package entry points. */
export interface CodexLimitsTuiPluginModule {
  id: "codex-limits";
  tui: (api: unknown) => void | Promise<void>;
}
/** Agent-specific name for the original package-root contract. */
export type CodexLimitsOpencodeExtension = CodexLimitsTuiPluginModule;
declare const plugin: CodexLimitsTuiPluginModule;
export default plugin;
export declare const tui: CodexLimitsOpencodeExtension["tui"];
