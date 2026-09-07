/**
 * @fileoverview CLI command-layer support for format json. It translates validated command input and shared core results into stable terminal or JSON behavior.
 */
/** Serializes one complete value as pretty JSON ending with a newline. */
export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
