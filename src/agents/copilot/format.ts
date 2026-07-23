import {formatAgentLimits} from "@/agents/shared/format";
import type {CodexLimitsResult} from "@/package/core/types";

/** Formats normalized Codex limits for the GitHub Copilot CLI timeline. */
export function formatCopilotLimits(result: CodexLimitsResult): string {
  return formatAgentLimits(result);
}
