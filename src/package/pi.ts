import piPlugin from "@/agents/pi/plugin";
import {exposeAgentHost} from "@/agents/shared/host-entry";

/** Public host-module contract exported from the pi-specific package subpath. */
export type CodexLimitsPiExtension = (api: unknown) => void;

const plugin = exposeAgentHost<CodexLimitsPiExtension>(piPlugin);

export default plugin;
