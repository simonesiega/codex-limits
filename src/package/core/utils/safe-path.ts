import {isAbsolute, relative, resolve, sep} from "node:path";
import {redactSensitiveText} from "@/package/core/utils/redact";

/** Checks containment after resolving both paths. */
export function isPathWithin(rootPath: string, candidatePath: string): boolean {
  const value = relative(resolve(rootPath), resolve(candidatePath));
  return value === "" || !isOutsideRelativePath(value);
}

/** Returns a redacted relative path, or `.` when the candidate escapes the root. */
export function toSafeRelativePath(rootPath: string, candidatePath: string): string {
  const value = relative(rootPath, candidatePath);
  return value && !isOutsideRelativePath(value) ? sanitizeDiagnosticPath(value) : ".";
}

function sanitizeDiagnosticPath(value: string): string {
  const sanitized = redactSensitiveText(value)
    .replace(/[\u0000-\u001f\u007f]/g, "?")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[id]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[id]");
  return sanitized.length <= 240 ? sanitized : `${sanitized.slice(0, 239)}…`;
}

function isOutsideRelativePath(value: string): boolean {
  return value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value);
}
