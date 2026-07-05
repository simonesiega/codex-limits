import type { CodexLimitsResult, UsageWindow } from "../core/types";
import { formatPercent, formatUnknown, formatWarnings } from "./format-shared";

/**
 * Formats the non-interactive status command output.
 *
 * @param result - Normalized Codex limits result.
 * @returns Human-readable status output ending with a newline.
 */
export function formatStatus(result: CodexLimitsResult): string {
  const lines = [
    "Usage Limits",
    "",
    ...formatUsageWindow(result.windows.fiveHour),
    ...formatUsageWindow(result.windows.weekly),
    "",
    `Reset coupons: ${formatUnknown(result.coupons?.available ?? null)} available`,
  ];

  if (result.warnings.length > 0) {
    lines.push("", "Warnings:", ...formatWarnings(result.warnings));
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Formats one usage window summary for status output.
 *
 * @param window - Usage window to format.
 * @returns Human-readable usage lines.
 */
function formatUsageWindow(window: UsageWindow | null): string[] {
  if (!window) {
    return ["Usage limit: Unknown"];
  }

  return [`${window.label}: ${formatPercent(window.remainingPercent)} remaining, resets in ${formatUnknown(window.resetsIn)}`];
}
