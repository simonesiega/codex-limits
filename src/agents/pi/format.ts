import {formatAgentLimits} from "@/agents/shared/format";
import type {CodexLimitsResult} from "@/package/core/types";

/** Formats normalized Codex limits for pi's extension dialog. */
export function formatPiLimits(result: CodexLimitsResult): string {
  return formatAgentLimits(result);
}
