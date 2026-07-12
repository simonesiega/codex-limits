/**
 * Formats a serializable value as JSON only.
 * @param value - Value to serialize.
 * @returns - Pretty JSON string ending with a newline.
 */
export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
