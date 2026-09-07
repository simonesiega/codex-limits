/**
 * @fileoverview Shared core logic for live payload. This module is part of the canonical data, normalization, or safety layer reused by commands, the TUI, and agent adapters.
 */
import type {UsageResult} from "@/package/core/types";
import {
  buildUsageResult,
  classifyUsageWindowByDuration,
  hasNamedUsageWindow,
  parseUsageWindowsFromRateLimits,
} from "@/package/core/usage/normalizer";
import {isRecord} from "@/package/core/utils/unknown";

const MAX_PAYLOAD_DEPTH = 5;
const MAX_PAYLOAD_NODES = 1_000;
const UNAVAILABLE_SOURCE = {kind: "unavailable", label: "Unavailable"} as const;

/** Finds and normalizes recognized rate-limit data in an untrusted live payload. */
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

/** Produces the canonical unavailable live result while retaining safe public warnings. */
export function unavailableLiveUsage(warnings: string[]): UsageResult {
  return buildUsageResult({fiveHour: null, weekly: null}, UNAVAILABLE_SOURCE, warnings);
}

/** Accepts both nested API wrappers and payloads that directly expose named windows. */
function findRateLimits(root: unknown): Record<string, unknown> | null {
  return searchPayload(root, (value) => {
    if (!isRecord(value)) {
      return null;
    }

    const direct = value.rate_limits ?? value.rateLimits ?? value.rate_limit ?? value.rateLimit;
    if (isRecord(direct)) {
      return direct;
    }

    return hasNamedUsageWindow(value) ? value : null;
  });
}

/** Adapts array-based API variants to the named shape consumed by the normalizer. */
function buildRateLimitsFromWindowArray(root: unknown): Record<string, unknown> | null {
  return searchPayload(root, (value) => {
    if (!Array.isArray(value)) {
      return null;
    }

    const fiveHour = value.find((item) => isUsageWindowRecord(item, "fiveHour"));
    const weekly = value.find((item) => isUsageWindowRecord(item, "weekly"));
    return fiveHour || weekly ? {fiveHour, weekly} : null;
  });
}

/** Searches untrusted payloads with explicit depth and node budgets to prevent pathological traversal. */
function searchPayload(
  root: unknown,
  match: (value: unknown) => Record<string, unknown> | null
): Record<string, unknown> | null {
  const queue: Array<{value: unknown; depth: number}> = [{value: root, depth: 0}];
  const seen = new WeakSet<object>();

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
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
    // Cap while enqueuing; limiting only the read index still lets a wide payload allocate an unbounded queue.
    for (const value of nested) {
      if (queue.length >= MAX_PAYLOAD_NODES) {
        break;
      }
      queue.push({value, depth: current.depth + 1});
    }
  }

  return null;
}

/** Uses declared duration first and bounded label hints only as a compatibility fallback. */
function isUsageWindowRecord(
  value: unknown,
  kind: "fiveHour" | "weekly"
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const durationKind = classifyUsageWindowByDuration(value);
  if (durationKind) {
    return durationKind === kind;
  }

  const label = String(
    value.type ?? value.kind ?? value.name ?? value.label ?? value.window ?? ""
  ).toLowerCase();
  return kind === "fiveHour"
    ? label.includes("primary") || label.includes("5-hour") || label.includes("five")
    : label.includes("secondary") || label.includes("weekly") || label.includes("week");
}
