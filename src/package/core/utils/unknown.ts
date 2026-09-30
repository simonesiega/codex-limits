/**
 * @fileoverview Type guards for untrusted JSON values from local files, network responses, and agent configuration.
 */
/** Narrows untrusted input to a plain object-like record, excluding null and arrays. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads and trims a non-empty string field from an already narrowed record. */
export function readString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}
