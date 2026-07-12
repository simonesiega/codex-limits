import {isAbsolute, relative, resolve, sep} from "node:path";
import {redactSensitiveText} from "./redact";

/**
 * Check if a candidate path is within a root path, returning true if it is, and false otherwise.
 * @param rootPath - The root path to check against.
 * @param candidatePath - The candidate path to check.
 * @returns - True if the candidate path is within the root path, false otherwise.
 */
export function isPathWithin(rootPath: string, candidatePath: string): boolean {
  const value = relative(resolve(rootPath), resolve(candidatePath));
  return value === "" || !isOutsideRelativePath(value);
}

/**
 * Check if a candidate path is within a root path, returning a safe relative path or "." if it is outside.
 * @param rootPath - The root path to check against.
 * @param candidatePath - The candidate path to check.
 * @returns - A safe relative path or "." if the candidate is outside the root.
 */
export function toSafeRelativePath(rootPath: string, candidatePath: string): string {
  const value = relative(rootPath, candidatePath);
  return value && !isOutsideRelativePath(value) ? sanitizeDiagnosticPath(value) : ".";
}

/**
 * Sanitizes a path for diagnostic purposes by redacting sensitive information and limiting its length.
 * @param value - The path to sanitize.
 * @returns - The sanitized path.
 */
function sanitizeDiagnosticPath(value: string): string {
  const sanitized = redactSensitiveText(value)
    .replace(/[\u0000-\u001f\u007f]/g, "?")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[id]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[id]");
  return sanitized.length <= 240 ? sanitized : `${sanitized.slice(0, 239)}…`;
}

/**
 * Check if a relative path is outside the current directory, returning true if it is, and false otherwise.
 * @param value - The relative path to check.
 * @returns - True if the relative path is outside the current directory, false otherwise.
 */
function isOutsideRelativePath(value: string): boolean {
  return value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value);
}
