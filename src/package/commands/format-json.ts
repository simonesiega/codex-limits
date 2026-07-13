/** Serializes one complete value as pretty JSON ending with a newline. */
export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
