import {formatPercent, formatUnknown, formatWarnings} from "@/package/commands/format-shared";
import type {CodexLimitsResult, UsageWindow} from "@/package/core/types";

/** Formats normalized usage limits as stable plain text. */
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

function formatUsageWindow(window: UsageWindow | null): string[] {
  return window
    ? [
        `${window.label}: ${formatPercent(window.remainingPercent)} remaining, resets in ${formatUnknown(window.resetsIn)}`,
      ]
    : ["Usage limit: Unknown"];
}
