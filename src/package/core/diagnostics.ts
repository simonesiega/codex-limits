import {redactSensitiveText} from "./utils/redact";

// Types of sources that can produce diagnostics.
export type DiagnosticSource = "authentication" | "filesystem" | "network" | "payload";

/**
 * Store diagnostic information about non-fatal warnings that occur during operations.
 */
export interface Diagnostic {
  // A unique code identifying the diagnostic.
  code: string;
  source: DiagnosticSource;
  severity: "warning";
  message: string;
}

/**
 * Wraps a diagnostic into a warning with sensitive information redacted.
 * @param code - The unique code identifying the diagnostic.
 * @param source - The source of the diagnostic.
 * @param message - The user-facing message for the diagnostic.
 * @returns - The created diagnostic.
 */
export function warningDiagnostic(
  code: string,
  source: DiagnosticSource,
  message: string
): Diagnostic {
  return {code, source, severity: "warning", message};
}

/**
 * Diagnostics are converted to warnings with sensitive information redacted for safe display.
 * @param diagnostics - The diagnostics to convert.
 * @returns - An array of warnings with sensitive information redacted.
 */
export function diagnosticsToWarnings(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => redactSensitiveText(diagnostic.message));
}
