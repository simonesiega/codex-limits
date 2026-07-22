const SENSITIVE_FIELD =
  /(?:chatgpt[-_]?account[-_]?id|access[-_]?token|refresh[-_]?token|id[-_]?token|session[-_]?token|api[-_]?key|account[-_]?id|authorization|cookie|client[-_]?secret|password|credential|secret|token)/;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

const SENSITIVE_ASSIGNMENT = new RegExp(
  `["']?${SENSITIVE_FIELD.source}["']?\\s*[:=]\\s*(?:"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|[^,\\r\\n}\\]&]+)`,
  "gi"
);

const SENSITIVE_PATTERNS = [
  SENSITIVE_ASSIGNMENT,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]{5,})?\b/g,
  /sk-[A-Za-z0-9_-]{10,}/g,
  /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi,
  /[A-Za-z0-9_-]{32,}/g,
] as const;

/** Removes credential-like values and terminal control characters from public text. */
export function redactSensitiveText(value: string): string {
  let redacted = value;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, "[redacted]");
  }
  return redacted.replace(CONTROL_CHARACTERS, "?");
}

/** Redacts every warning before it reaches a public output surface. */
export function redactWarnings(warnings: readonly string[]): string[] {
  return warnings.map(redactSensitiveText);
}
