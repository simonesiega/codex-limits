/**
 * Truncates a string to fit within a specified width, appending an ellipsis if necessary.
 * @param value - The string to truncate.
 * @param width - The maximum width for the string.
 * @returns - The truncated string with an ellipsis if necessary.
 */
export function truncateText(value: string, width: number): string {
  const safeWidth = Math.max(Math.floor(width), 0);
  if (value.length <= safeWidth) {
    return value;
  }
  if (safeWidth <= 1) {
    return value.slice(0, safeWidth);
  }
  return `${value.slice(0, safeWidth - 1)}…`;
}
