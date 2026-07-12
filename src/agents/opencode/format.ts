import type {CodexLimitsResult, UsageWindow} from "../../package/core/types";

const BAR_WIDTH = 22;

/**
 * Formats Codex limits for opencode's built-in centered alert dialog.
 * @param result - The CodexLimitsResult object containing the usage limits and warnings.
 * @returns - The formatted string.
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

/**
 * Formats a usage window for opencode's built-in centered alert dialog.
 * @param title - The title of the usage window (e.g., "5-hour" or "Weekly").
 * @param window - The UsageWindow object containing the remaining percentage and reset time.
 * @returns - An array of formatted strings representing the usage window.
 */
function formatWindow(title: string, window: UsageWindow | null): string[] {
  const percent = window?.remainingPercent ?? null;

  return [
    `${title}  ${statusLabel(percent)}`,
    `Remaining  ${remainingLabel(percent)}`,
    progressBar(percent),
    `Reset      ${window?.resetsIn ? `in ${window.resetsIn}` : "unknown"}`,
  ];
}

/**
 * Formats the remaining percentage for opencode's built-in centered alert dialog.
 * @param value - The remaining percentage of the usage window.
 * @returns - A string representing the remaining percentage, or "Unknown" if the value is null.
 */
function remainingLabel(value: number | null): string {
  return value === null ? "Unknown" : `${Math.round(value)}% remaining`;
}

/**
 * Formats the progress bar for opencode's built-in centered alert dialog.
 * @param value - The remaining percentage of the usage window.
 * @returns - A string representing the progress bar.
 */
function progressBar(value: number | null): string {
  const percent = clampPercent(value);
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const empty = Math.max(BAR_WIDTH - filled, 0);

  return `[${"=".repeat(filled)}${" ".repeat(empty)}] ${Math.round(percent)}%`;
}

/**
 * Formats the credits information for opencode's built-in centered alert dialog.
 * @param result - The CodexLimitsResult object containing the credits information.
 * @returns - An array of formatted strings representing the credits information.
 */
function formatCredits(result: CodexLimitsResult): string[] {
  const available = result.coupons?.available;
  const expires = formatExpiration(result);
  const lines = [
    `Reset credits  ${available === null || available === undefined ? "Unknown" : creditLabel(available)}`,
  ];

  if (expires !== "unknown") {
    lines.push(`Next expires   ${expires}`);
  }

  return lines;
}

/**
 * Formats the credit label for opencode's built-in centered alert dialog.
 * @param value - The number of available credits.
 * @returns - A string representing the available credits, with proper pluralization.
 */
function creditLabel(value: number): string {
  const suffix = value === 1 ? "credit available" : "credits available";
  return `${value} ${suffix}`;
}

/**
 * Formats the warnings for opencode's built-in centered alert dialog.
 * @param warnings - An array of warning messages.
 * @returns - An array of formatted strings representing the warnings.
 */
function formatWarnings(warnings: string[]): string[] {
  if (warnings.length === 0) {
    return [];
  }

  return ["", "Warnings", ...warnings.map((warning) => `- ${warning}`)];
}

/**
 * Formats the status label for opencode's built-in centered alert dialog.
 * @param value - The remaining percentage of the usage window.
 * @returns - A string representing the status.
 */
function statusLabel(value: number | null): string {
  if (value === null) return "Unknown";
  if (value >= 50) return "Healthy";
  if (value >= 15) return "Low";
  return "Critical";
}

/**
 * Clamps the percentage value between 0 and 100.
 * @param value - The percentage value to clamp.
 * @returns - The clamped percentage value.
 */
function clampPercent(value: number | null): number {
  if (value === null) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 100);
}

/**
 * Formats the expiration information for opencode's built-in centered alert dialog.
 * @param result - The CodexLimitsResult object containing the expiration information.
 * @returns - A string representing the expiration information, or "unknown" if not available.
 */
function formatExpiration(result: CodexLimitsResult): string {
  const expiresIn = result.coupons?.nextExpirationIn;
  const expiresAt = result.coupons?.nextExpirationDate;

  if (expiresIn && expiresAt) {
    return `${expiresIn} (${expiresAt})`;
  }

  return expiresIn ?? expiresAt ?? "unknown";
}
