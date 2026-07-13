import {isAbsolute} from "node:path";
import {redactSensitiveText} from "@/package/core/utils/redact";

const SENSITIVE_OPTION =
  /(?:access[-_]?token|account[-_]?id|authorization|cookie|secret|api[-_]?key)/i;

/** Sanitizes rejected CLI arguments before they are echoed to stderr. */
export function sanitizeArguments(args: readonly string[]): string {
  const safe: string[] = [];
  let redactNext = false;

  for (const arg of args) {
    if (redactNext) {
      safe.push("[redacted]");
      redactNext = false;
      continue;
    }

    const separator = arg.indexOf("=");
    const optionName = separator >= 0 ? arg.slice(0, separator) : arg;
    if (SENSITIVE_OPTION.test(optionName)) {
      safe.push(separator >= 0 ? `${optionName}=[redacted]` : optionName);
      redactNext = separator < 0;
      continue;
    }

    const possibleValue = separator >= 0 ? arg.slice(separator + 1) : arg;
    if (
      isAbsolute(possibleValue) ||
      /^[A-Za-z]:[\\/]/.test(possibleValue) ||
      possibleValue.startsWith("~/") ||
      possibleValue.includes("/") ||
      possibleValue.includes("\\")
    ) {
      safe.push(separator >= 0 ? `${optionName}=[path]` : "[path]");
      continue;
    }

    const printable = arg.replace(/[\u0000-\u001f\u007f]/g, "?");
    safe.push(printable.length <= 100 ? redactSensitiveText(printable) : "[argument]");
  }

  return safe.join(" ");
}

/** Returns a deterministic failure message without raw exception details. */
export function operationFailure(operation: "coupons" | "dashboard" | "init" | "status"): string {
  switch (operation) {
    case "coupons":
      return "codex-limits: Could not load reset coupon data.\n";
    case "dashboard":
      return "codex-limits: Could not open the dashboard.\n";
    case "init":
      return "codex-limits: Could not initialize agent integrations.\n";
    case "status":
      return "codex-limits: Could not load Codex limits.\n";
  }
}
