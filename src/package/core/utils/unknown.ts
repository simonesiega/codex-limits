/**
 * Check if an unknown value is a record (object) with string keys and unknown values.
 * @param value - The unknown value to check.
 * @returns - True if the value is a record, false otherwise.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a non-empty string property from an unknown record.
 * @param value - The record to read from.
 * @param key - The key of the property to read.
 * @returns - The value of the property if it is a non-empty string, null otherwise.
 */
export function readString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" && field.trim().length > 0 ? field.trim() : null;
}
