import {opencodeIntegration} from "@/agents/opencode/integration";
import {piIntegration} from "@/agents/pi/integration";
import type {AgentIntegration} from "@/agents/types";

export {AgentInstallError} from "@/agents/types";
export type {
  AgentEnvironmentVariable,
  AgentInstallResult,
  AgentIntegration,
  AgentIntegrationStatus,
} from "@/agents/types";

/** Optional integrations available through every agent-aware command. */
export const AGENT_INTEGRATIONS: readonly AgentIntegration[] = [opencodeIntegration, piIntegration];
