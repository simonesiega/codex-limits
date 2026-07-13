const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /["']?(?:access_token|refresh_token|api_key|account_id|authorization|chatgpt-account-id|cookie)["']?\s*[:=]\s*["']?[^"',\s}\]]+["']?/gi,
  /(?:access_token|refresh_token|api_key|account_id)=([^&\s]+)/gi,
  /sk-[A-Za-z0-9_-]{10,}/g,
] as const;

/** Removes token-like and account-like values from diagnostic text. */
export function redactSensitiveText(value: string): string {
  let redacted = value;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, "[redacted]");
  }
  return redacted;
}

export function redactWarnings(warnings: readonly string[]): string[] {
  return warnings.map(redactSensitiveText);
}
