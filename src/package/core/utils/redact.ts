const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /["']?(?:access_token|refresh_token|api_key|account_id|authorization|chatgpt-account-id|cookie)["']?\s*[:=]\s*["']?[^"',\s}\]]+["']?/gi,
  /(?:access_token|refresh_token|api_key|account_id)=([^&\s]+)/gi,
  /sk-[A-Za-z0-9_-]{10,}/g,
] as const;

/**
 * Redacts token-like and account-like values from diagnostic text.
 * @param value - Text that may contain a secret-like value.
 * @returns - Text with sensitive matches replaced by [redacted].
 */
export function redactSensitiveText(value: string): string {
  let redacted = value;

  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, "[redacted]");
  }

  return redacted;
}

/**
 * Redacts each warning before it is exposed outside the core.
 * @param warnings - Non-fatal warning strings.
 * @returns - Redacted warning strings.
 */
export function redactWarnings(warnings: string[]): string[] {
  return warnings.map(redactSensitiveText);
}
