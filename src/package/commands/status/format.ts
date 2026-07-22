import {formatPercent, formatUnknown, formatWarnings} from "@/package/commands/format-shared";
import type {CodexLimitsResult, UsageWindow} from "@/package/core/types";

/** Formats normalized usage limits as stable plain text. */
export function formatStatus(result: CodexLimitsResult): string {
  const windows = [result.windows.fiveHour, result.windows.weekly].filter(
    (window): window is UsageWindow => window !== null
  );
  const usageLines =
    windows.length > 0 ? windows.flatMap(formatUsageWindow) : ["Usage limits: Unavailable"];
  const lines = [
    "Usage Limits",
    "",
    ...usageLines,
    "",
    `Reset coupons: ${formatUnknown(result.coupons?.available ?? null)} available`,
  ];

  if (result.warnings.length > 0) {
    lines.push("", "Warnings:", ...formatWarnings(result.warnings));
  }

  return `${lines.join("\n")}\n`;
}

function formatUsageWindow(window: UsageWindow): string[] {
  return [
    `${window.label}: ${formatPercent(window.remainingPercent)} remaining, resets in ${formatUnknown(window.resetsIn)}`,
  ];
}
