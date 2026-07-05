/**
 * Formats nullable values using a consistent fallback label.
 *
 * @param value - Value to format.
 * @returns String value or Unknown.
 */
export function formatUnknown(value: number | string | null): string {
  return value === null ? "Unknown" : String(value);
}

/**
 * Formats a percentage value for terminal commands.
 *
 * @param value - Percentage value to format.
 * @returns Percentage label or Unknown.
 */
export function formatPercent(value: number | null): string {
  return value === null ? "Unknown" : `${Math.round(value)}%`;
}

/**
 * Formats warning lines with a stable empty state.
 *
 * @param warnings - Warning strings to format.
 * @returns Warning lines for command output.
 */
export function formatWarnings(warnings: string[]): string[] {
  if (warnings.length === 0) {
    return ["- none"];
  }

  return warnings.map((warning) => `- ${warning}`);
}
