/**
 * @fileoverview Shared core logic for diagnostics. This module is part of the canonical data, normalization, or safety layer reused by commands, the TUI, and agent adapters.
 */
import {redactSensitiveText} from "@/package/core/utils/redact";

export type DiagnosticSource = "authentication" | "filesystem" | "network" | "payload";

/** Structured internal warning that contains no raw error object. */
export interface Diagnostic {
  code: string;
  source: DiagnosticSource;
  severity: "warning";
  message: string;
}

/** Creates a stable warning value without retaining a potentially sensitive thrown error. */
export function warningDiagnostic(
  code: string,
  source: DiagnosticSource,
  message: string
): Diagnostic {
  return {code, source, severity: "warning", message};
}

/** Converts internal diagnostics into redacted public warnings. */
export function diagnosticsToWarnings(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => redactSensitiveText(diagnostic.message));
}
