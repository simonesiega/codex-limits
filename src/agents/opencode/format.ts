import type { CodexLimitsResult, UsageWindow } from "../../package/core/types";

const BAR_WIDTH = 22;

/**
 * Formats Codex limits for opencode's built-in centered alert dialog.
 */
export function formatOpencodeLimits(result: CodexLimitsResult): string {
  return [
    ...formatWindow("5-hour", result.windows.fiveHour),
    "",
    ...formatWindow("Weekly", result.windows.weekly),
    "",
    ...formatCredits(result),
    ...formatWarnings(result.warnings),
  ].join("\n");
}

function formatWindow(title: string, window: UsageWindow | null): string[] {
  const percent = window?.remainingPercent ?? null;

  return [
    `${title}  ${statusLabel(percent)}`,
    `Remaining  ${remainingLabel(percent)}`,
    progressBar(percent),
    `Reset      ${window?.resetsIn ? `in ${window.resetsIn}` : "unknown"}`,
  ];
}

function remainingLabel(value: number | null): string {
  return value === null ? "Unknown" : `${Math.round(value)}% remaining`;
}

function progressBar(value: number | null): string {
  const percent = clampPercent(value);
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const empty = Math.max(BAR_WIDTH - filled, 0);

  return `[${"=".repeat(filled)}${" ".repeat(empty)}] ${Math.round(percent)}%`;
}

function formatCredits(result: CodexLimitsResult): string[] {
  const available = result.coupons?.available;
  const expires = formatExpiration(result);
  const lines = [`Reset credits  ${available === null || available === undefined ? "Unknown" : creditLabel(available)}`];

  if (expires !== "unknown") {
    lines.push(`Next expires   ${expires}`);
  }

  return lines;
}

function creditLabel(value: number): string {
  const suffix = value === 1 ? "credit available" : "credits available";
  return `${value} ${suffix}`;
}

function formatWarnings(warnings: string[]): string[] {
  if (warnings.length === 0) {
    return [];
  }

  return ["", "Warnings", ...warnings.map((warning) => `- ${warning}`)];
}

function statusLabel(value: number | null): string {
  if (value === null) return "Unknown";
  if (value >= 50) return "Healthy";
  if (value >= 15) return "Low";
  return "Critical";
}

function clampPercent(value: number | null): number {
  if (value === null) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 100);
}

function formatExpiration(result: CodexLimitsResult): string {
  const expiresIn = result.coupons?.nextExpirationIn;
  const expiresAt = result.coupons?.nextExpirationDate;

  if (expiresIn && expiresAt) {
    return `${expiresIn} (${expiresAt})`;
  }

  return expiresIn ?? expiresAt ?? "unknown";
}
