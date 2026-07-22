import type {CodexLimitsResult, UsageWindow} from "@/package/core/types";

const BAR_WIDTH = 22;

/** Formats normalized Codex limits for OpenCode's alert dialog. */
export function formatOpencodeLimits(result: CodexLimitsResult): string {
  const sections: string[][] = [];

  if (result.windows.fiveHour) {
    sections.push(formatWindow("5-hour", result.windows.fiveHour));
  }
  if (result.windows.weekly) {
    sections.push(formatWindow("Weekly", result.windows.weekly));
  }
  if (sections.length === 0) {
    sections.push(["Usage limits  Unavailable"]);
  }

  sections.push(formatCredits(result));
  if (result.warnings.length > 0) {
    sections.push(["Warnings", ...result.warnings.map((warning) => `- ${warning}`)]);
  }

  return sections.map((section) => section.join("\n")).join("\n\n");
}

function formatWindow(title: string, window: UsageWindow): string[] {
  const percent = window.remainingPercent;

  return [
    `${title}  ${statusLabel(percent)}`,
    `Remaining  ${percent === null ? "Unknown" : `${Math.round(percent)}% remaining`}`,
    progressBar(percent),
    `Reset      ${window.resetsIn ? `in ${window.resetsIn}` : "unknown"}`,
  ];
}

function progressBar(value: number | null): string {
  const percent = value === null ? 0 : Math.min(Math.max(value, 0), 100);
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  return `[${"=".repeat(filled)}${" ".repeat(BAR_WIDTH - filled)}] ${Math.round(percent)}%`;
}

function formatCredits(result: CodexLimitsResult): string[] {
  const available = result.coupons?.available;
  const availableLabel =
    available === null || available === undefined
      ? "Unknown"
      : `${available} ${available === 1 ? "credit" : "credits"} available`;
  const lines = [`Reset credits  ${availableLabel}`];
  const expiresIn = result.coupons?.nextExpirationIn;
  const expiresAt = result.coupons?.nextExpirationDate;
  const expiration =
    expiresIn && expiresAt ? `${expiresIn} (${expiresAt})` : (expiresIn ?? expiresAt);

  if (expiration !== null && expiration !== undefined) {
    lines.push(`Next expires   ${expiration}`);
  }

  return lines;
}

function statusLabel(value: number | null): string {
  if (value === null) return "Unknown";
  if (value >= 50) return "Healthy";
  if (value >= 15) return "Low";
  return "Critical";
}
