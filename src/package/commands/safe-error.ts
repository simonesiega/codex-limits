import {isAbsolute} from "node:path";
import {redactSensitiveText} from "@/package/core/utils/redact";

const SENSITIVE_OPTION =
  /(?:token|account[-_]?id|authorization|cookie|secret|password|credential|api[-_]?key)/i;
const PRIVATE_PATH = /(?:[A-Za-z]:[\\/]|(?:^|[\s("'`=:[{])(?:~[\\/]|[\\/]{1,2}\S+))/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
const MAX_ERROR_MESSAGE_LENGTH = 240;

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

    const printableArg = arg.replace(CONTROL_CHARACTERS, "?");
    const separator = printableArg.indexOf("=");
    const optionName = separator >= 0 ? printableArg.slice(0, separator) : printableArg;
    const displayedOptionName = optionName.length <= 100 ? optionName : "[option]";
    if (SENSITIVE_OPTION.test(optionName)) {
      safe.push(separator >= 0 ? `${displayedOptionName}=[redacted]` : displayedOptionName);
      redactNext = separator < 0;
      continue;
    }

    const possibleValue = separator >= 0 ? printableArg.slice(separator + 1) : printableArg;
    if (
      isAbsolute(possibleValue) ||
      /^[A-Za-z]:[\\/]/.test(possibleValue) ||
      possibleValue.startsWith("~/") ||
      possibleValue.includes("/") ||
      possibleValue.includes("\\")
    ) {
      safe.push(separator >= 0 ? `${displayedOptionName}=[path]` : "[path]");
      continue;
    }

    safe.push(printableArg.length <= 100 ? redactSensitiveText(printableArg) : "[argument]");
  }

  return safe.join(" ");
}

/** Redacts and bounds a candidate error before it reaches terminal output. */
export function sanitizePublicErrorMessage(value: string, fallback: string): string {
  if (!value || value.length > MAX_ERROR_MESSAGE_LENGTH) {
    return fallback;
  }
  const message = redactSensitiveText(value).replace(CONTROL_CHARACTERS, "?").trim();
  return message && message.length <= MAX_ERROR_MESSAGE_LENGTH && !PRIVATE_PATH.test(message)
    ? message
    : fallback;
}
