import type {UsageResult} from "../types";
import {buildUsageResult, parseUsageWindowsFromRateLimits} from "./normalizer";
import {isRecord} from "../utils/unknown";

const MAX_PAYLOAD_DEPTH = 5;
const MAX_PAYLOAD_NODES = 1_000;
const UNAVAILABLE_SOURCE = {kind: "unavailable", label: "Unavailable"} as const;

/**
 * Maps an unknown live usage payload into a normalized usage result.
 * @param payload - The unknown payload received from the live usage endpoint.
 * @param endpoint - The endpoint from which the payload was received, used for diagnostic purposes.
 * @param now - The current date and time, used for calculating usage windows.
 * @returns - A UsageResult object representing the normalized usage data, or an unavailable result if the payload is invalid.
 */
export function mapLiveUsagePayload(payload: unknown, endpoint: string, now: Date): UsageResult {
  const rateLimits = findRateLimits(payload) ?? buildRateLimitsFromWindowArray(payload);
  if (!rateLimits) {
    return unavailableLiveUsage(["Live usage endpoint returned an unexpected payload."]);
  }

  const result = buildUsageResult(parseUsageWindowsFromRateLimits(rateLimits, now), {
    kind: "api",
    label: "API",
    endpoint,
  });

  if (result.status === "unavailable") {
    return unavailableLiveUsage(["Live usage endpoint returned an unexpected payload."]);
  }

  if (result.status === "partial") {
    return {...result, warnings: ["Live usage endpoint returned incomplete usage data."]};
  }

  return result;
}

/**
 * Creates an unavailable live usage result with compatible warning strings.
 * @param warnings - An array of warning messages describing the issue.
 * @returns - A UsageResult object representing the unavailable usage data.
 */
export function unavailableLiveUsage(warnings: string[]): UsageResult {
  return buildUsageResult({fiveHour: null, weekly: null}, UNAVAILABLE_SOURCE, warnings);
}

/**
 * Searches the payload for rate limits.
 * @param root - The root of the payload to search.
 * @returns - The rate limits object if found, otherwise null.
 */
function findRateLimits(root: unknown): Record<string, unknown> | null {
  return searchPayload(root, (value) => {
    if (!isRecord(value)) {
      return null;
    }

    const direct = value.rate_limits ?? value.rateLimits ?? value.rate_limit ?? value.rateLimit;
    if (isRecord(direct)) {
      return direct;
    }

    return isRecord(value.primary) ||
      isRecord(value.secondary) ||
      isRecord(value.primary_window) ||
      isRecord(value.secondary_window)
      ? value
      : null;
  });
}

/**
 * Builds rate limits from an array of usage windows.
 * @param root - The root of the payload to search.
 * @returns - The rate limits object if found, otherwise null.
 */
function buildRateLimitsFromWindowArray(root: unknown): Record<string, unknown> | null {
  return searchPayload(root, (value) => {
    if (!Array.isArray(value)) {
      return null;
    }

    const primary = value.find((item) => isUsageWindowRecord(item, "primary"));
    const secondary = value.find((item) => isUsageWindowRecord(item, "secondary"));
    return primary || secondary ? {primary, secondary} : null;
  });
}

/**
 * Searches the payload for a matching node based on the provided criteria.
 * @param root - The root of the payload to search.
 * @param match - A function that determines if a node matches the search criteria.
 * @returns - The matching node if found, otherwise null.
 */
function searchPayload(
  root: unknown,
  match: (value: unknown) => Record<string, unknown> | null
): Record<string, unknown> | null {
  const queue: Array<{value: unknown; depth: number}> = [{value: root, depth: 0}];
  const seen = new WeakSet<object>();
  let index = 0;

  while (index < queue.length && index < MAX_PAYLOAD_NODES) {
    const current = queue[index];
    index += 1;
    if (!current) {
      break;
    }

    const found = match(current.value);
    if (found) {
      return found;
    }

    if (current.depth >= MAX_PAYLOAD_DEPTH || typeof current.value !== "object" || !current.value) {
      continue;
    }
    if (seen.has(current.value)) {
      continue;
    }
    seen.add(current.value);

    const nested = Array.isArray(current.value)
      ? current.value
      : isRecord(current.value)
        ? Object.values(current.value)
        : [];
    for (const value of nested) {
      queue.push({value, depth: current.depth + 1});
    }
  }

  return null;
}

/**
 * Check if a value is a usage window record of the specified kind (primary or secondary).
 * @param value - The value to check.
 * @param kind - The kind of usage window to check for ("primary" or "secondary").
 * @returns - True if the value is a usage window record of the specified kind, otherwise false.
 */
function isUsageWindowRecord(
  value: unknown,
  kind: "primary" | "secondary"
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const label = String(
    value.type ?? value.kind ?? value.name ?? value.label ?? value.window ?? ""
  ).toLowerCase();
  if (
    kind === "primary" &&
    (label.includes("primary") || label.includes("5-hour") || label.includes("five"))
  ) {
    return true;
  }
  if (
    kind === "secondary" &&
    (label.includes("secondary") || label.includes("weekly") || label.includes("week"))
  ) {
    return true;
  }

  const minutes =
    value.window_minutes ??
    value.windowMinutes ??
    value.window_length_minutes ??
    value.windowLengthMinutes;
  return kind === "primary" ? minutes === 300 : minutes === 10_080;
}
