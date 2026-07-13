/** Formats a nullable command value with the stable Unknown fallback. */
export function formatUnknown(value: number | string | null): string {
  return value === null ? "Unknown" : String(value);
}

/** Formats a nullable percentage for plain-text commands. */
export function formatPercent(value: number | null): string {
  return value === null ? "Unknown" : `${Math.round(value)}%`;
}

/** Prefixes safe warning strings for plain-text commands. */
export function formatWarnings(warnings: readonly string[]): string[] {
  return warnings.map((warning) => `- ${warning}`);
}
