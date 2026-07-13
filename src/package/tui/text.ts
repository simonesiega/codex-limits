/** Truncates plain terminal text to a non-negative character width. */
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
