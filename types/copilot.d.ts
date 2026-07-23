/** Public host-module contract exported from the Copilot-specific package subpath. */
export type CodexLimitsCopilotExtension = () => Promise<void>;
declare const plugin: CodexLimitsCopilotExtension;
export declare const COPILOT_EXTENSION_MARKER: "codex-limits-copilot-extension-v1";
export declare const startCopilotExtension: CodexLimitsCopilotExtension;
export default plugin;
