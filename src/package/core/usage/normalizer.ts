import {formatDuration, parseDateValue} from "../utils/date-time";
import {redactSensitiveText} from "../utils/redact";
import type {
  AvailabilityStatus,
  CodexSessionReadResult,
  CodexStateReadResult,
  LocalUsageResult,
  UsageResult,
  UsageSource,
  UsageWindow,
  UsageWindows,
} from "../types";

const MAX_SEARCH_DEPTH = 5;
const FIVE_HOUR_LABEL = "5-hour usage limit";
const WEEKLY_LABEL = "Weekly usage limit";
const FIVE_HOUR_KEYS = [
  "fiveHour",
  "five_hour",
  "fiveHourWindow",
  "five_hour_window",
  "primary",
  "primaryWindow",
  "primary_window",
  "main",
  "mainWindow",
] as const;
const WEEKLY_KEYS = [
  "weekly",
  "week",
  "weeklyWindow",
  "weekly_window",
  "secondary",
  "secondaryWindow",
  "secondary_window",
  "backup",
  "backupWindow",
] as const;
const USED_KEYS = [
  "used_percent",
  "usedPercent",
  "used",
  "usage",
  "percentUsed",
  "usagePercent",
  "usagePercentage",
  "percent",
] as const;
const REMAINING_KEYS = [
  "remaining_percent",
  "remainingPercent",
  "remaining",
  "percentRemaining",
  "availablePercent",
  "available_percentage",
] as const;
const RESETS_AT_KEYS = [
  "resets_at",
  "resetsAt",
  "resetAt",
  "resetTime",
  "reset_at",
  "reset",
  "ends_at",
  "endsAt",
  "windowEnd",
] as const;
const RESETS_IN_KEYS = ["resetsIn", "resetIn", "resets_in", "reset_in", "timeUntilReset"] as const;

/**
 * Parses normalized local usage data from Codex rollout JSONL session logs.
 * @param sessions - Local session inspection result.
 * @param now - Current time used to compute reset durations.
 * @returns - Normalized local usage result.
 */
export function parseUsageFromSessions(
  sessions: CodexSessionReadResult,
  now: Date = new Date()
): LocalUsageResult {
  const snapshot = sessions.latestSnapshot;
  if (!snapshot) {
    return unavailableLocalUsage(sessions.warnings);
  }

  return buildLocalUsageResult(
    parseUsageWindowsFromRateLimits(snapshot.rateLimits, now),
    sessions.warnings
  );
}

/**
 * Parses Codex primary and secondary rate-limit windows from a rate_limits object.
 * @param rateLimits - Codex rate_limits object.
 * @param now - Current time used to compute reset durations.
 * @returns - Normalized 5-hour and weekly windows.
 */
export function parseUsageWindowsFromRateLimits(
  rateLimits: Record<string, unknown>,
  now: Date = new Date()
): UsageWindows {
  return {
    fiveHour: parseUsageWindow(readRecord(rateLimits, FIVE_HOUR_KEYS), FIVE_HOUR_LABEL, now),
    weekly: parseUsageWindow(readRecord(rateLimits, WEEKLY_KEYS), WEEKLY_LABEL, now),
  };
}

/**
 * Adds source metadata to normalized local usage windows.
 * @param result - Local usage result.
 * @param source - Usage source metadata.
 * @returns - Usage result with source metadata.
 */
export function withUsageSource(result: LocalUsageResult, source: UsageSource): UsageResult {
  return {...result, source};
}

/**
 * Builds a usage result from already-normalized windows.
 * @param windows - Normalized usage windows.
 * @param source - Usage source metadata.
 * @param warnings - Non-sensitive warnings to include.
 * @returns - Usage result with derived availability.
 */
export function buildUsageResult(
  windows: UsageWindows,
  source: UsageSource,
  warnings: string[] = []
): UsageResult {
  return {...buildLocalUsageResult(windows, warnings), source};
}

/**
 * Parses normalized local usage data from safe Codex state JSON files.
 * @param state - Safe local state files and warnings collected from the Codex home.
 * @param now - Current time used to compute reset durations.
 * @returns - Normalized local usage result.
 */
export function parseUsageFromState(
  state: CodexStateReadResult,
  now: Date = new Date()
): LocalUsageResult {
  let windows: UsageWindows = {fiveHour: null, weekly: null};

  for (const file of state.files) {
    if (!file.json) {
      continue;
    }

    const parsed = parseUsageFromUnknown(file.json, now);
    windows = mergeUsageWindows(windows, parsed.windows);
  }

  return buildLocalUsageResult(windows, state.warnings);
}

/**
 * Returns an unavailable local usage result with safe warnings.
 * @param warnings - Non-sensitive warnings to include.
 * @returns - Normalized unavailable local usage result.
 */
export function unavailableLocalUsage(warnings: string[] = []): LocalUsageResult {
  return {
    status: "unavailable",
    windows: {fiveHour: null, weekly: null},
    warnings,
  };
}

/**
 * Merges two local usage results, preferring the primary result and filling gaps from fallback.
 * @param primary - Preferred local usage result.
 * @param fallback - Fallback local usage result.
 * @returns - Merged local usage result.
 */
export function mergeLocalUsage(
  primary: LocalUsageResult,
  fallback: LocalUsageResult
): LocalUsageResult {
  const windows = mergeUsageWindows(primary.windows, fallback.windows);

  return buildLocalUsageResult(windows, [...primary.warnings, ...fallback.warnings]);
}

/**
 * Parses local usage data from an unknown JSON value.
 * @param value - Parsed JSON value from a safe local file.
 * @param now - Current time used to compute reset durations.
 * @returns - Parsed usage windows.
 */
function parseUsageFromUnknown(value: unknown, now: Date): Pick<LocalUsageResult, "windows"> {
  if (!isRecord(value)) {
    return {windows: {fiveHour: null, weekly: null}};
  }

  const fiveHourSource = findRecord(value, FIVE_HOUR_KEYS);
  const weeklySource = findRecord(value, WEEKLY_KEYS);
  const fiveHour = parseUsageWindow(
    fiveHourSource ?? (weeklySource ? null : value),
    FIVE_HOUR_LABEL,
    now
  );
  const weekly = parseUsageWindow(weeklySource, WEEKLY_LABEL, now);

  return {
    windows: {fiveHour, weekly},
  };
}

/**
 * Parses a single normalized usage window from a record.
 * @param value - Object that may contain usage and reset fields.
 * @param label - Stable label for the usage window.
 * @param now - Current time used to compute reset durations.
 * @returns - Normalized usage window, or null when no window values are present.
 */
function parseUsageWindow(
  value: Record<string, unknown> | null,
  label: string,
  now: Date
): UsageWindow | null {
  if (!value) {
    return null;
  }

  const used = toPercent(findValue(value, USED_KEYS, true));
  const remaining = toPercent(findValue(value, REMAINING_KEYS, true));
  const usedPercent = used ?? (remaining === null ? null : clampPercent(100 - remaining));
  const remainingPercent = remaining ?? (used === null ? null : clampPercent(100 - used));
  const resetValue = findValue(value, RESETS_AT_KEYS, true);
  const resetDate = parseDateValue(resetValue);
  const resetsAt = resetDate ? resetDate.toISOString() : null;
  const rawResetsIn = readStringValue(findValue(value, RESETS_IN_KEYS, true));
  const resetsIn = resetDate
    ? formatDuration(resetDate.getTime() - now.getTime())
    : rawResetsIn && rawResetsIn.length <= 100
      ? redactSensitiveText(rawResetsIn)
      : null;
  const window = {label, remainingPercent, usedPercent, resetsAt, resetsIn};

  return hasWindowData(window) ? window : null;
}

/**
 * Builds a local usage result and derives its availability status.
 * @param windows - Parsed 5-hour and weekly usage windows.
 * @param warnings - Non-sensitive warnings to include.
 * @returns - Normalized local usage result.
 */
function buildLocalUsageResult(windows: UsageWindows, warnings: string[]): LocalUsageResult {
  return {
    status: statusForWindows(windows),
    windows,
    warnings,
  };
}

/**
 * Computes availability from normalized usage windows.
 * @param windows - Usage windows to inspect.
 * @returns - Availability status for local usage data.
 */
function statusForWindows(windows: UsageWindows): AvailabilityStatus {
  const complete = isCompleteWindow(windows.fiveHour) && isCompleteWindow(windows.weekly);
  if (complete) {
    return "available";
  }

  if (hasWindowData(windows.fiveHour) || hasWindowData(windows.weekly)) {
    return "partial";
  }

  return "unavailable";
}

/**
 * Merges two usage-window groups, filling missing values from fallback windows.
 * @param primary - Preferred windows.
 * @param fallback - Fallback windows.
 * @returns - Merged usage windows.
 */
function mergeUsageWindows(primary: UsageWindows, fallback: UsageWindows): UsageWindows {
  return {
    fiveHour: mergeUsageWindow(primary.fiveHour, fallback.fiveHour, FIVE_HOUR_LABEL),
    weekly: mergeUsageWindow(primary.weekly, fallback.weekly, WEEKLY_LABEL),
  };
}

/**
 * Merges two usage windows with the same label.
 * @param primary - Preferred window.
 * @param fallback - Fallback window.
 * @param label - Stable window label.
 * @returns - Merged usage window, or null when both are empty.
 */
function mergeUsageWindow(
  primary: UsageWindow | null,
  fallback: UsageWindow | null,
  label: string
): UsageWindow | null {
  if (!primary && !fallback) {
    return null;
  }

  return {
    label,
    remainingPercent: primary?.remainingPercent ?? fallback?.remainingPercent ?? null,
    usedPercent: primary?.usedPercent ?? fallback?.usedPercent ?? null,
    resetsAt: primary?.resetsAt ?? fallback?.resetsAt ?? null,
    resetsIn: primary?.resetsIn ?? fallback?.resetsIn ?? null,
  };
}

/**
 * Checks whether a usage window has at least one known value.
 * @param window - Window to inspect.
 * @returns - True when any value is known.
 */
function hasWindowData(window: UsageWindow | null): boolean {
  return (
    window !== null &&
    (window.remainingPercent !== null ||
      window.usedPercent !== null ||
      window.resetsAt !== null ||
      window.resetsIn !== null)
  );
}

/**
 * Checks whether a usage window has the values needed for the dashboard.
 * @param window - Window to inspect.
 * @returns - True when percentage and reset data are known.
 */
function isCompleteWindow(window: UsageWindow | null): boolean {
  return (
    window !== null &&
    window.remainingPercent !== null &&
    window.usedPercent !== null &&
    (window.resetsAt !== null || window.resetsIn !== null)
  );
}

/**
 * Finds the first nested object under any recognized key.
 * @param value - Object to search.
 * @param keys - Candidate property names.
 * @param depth - Current recursion depth.
 * @returns - Matching object or null when none is found.
 */
function findRecord(
  value: Record<string, unknown>,
  keys: readonly string[],
  depth = 0
): Record<string, unknown> | null {
  if (depth > MAX_SEARCH_DEPTH) {
    return null;
  }

  for (const key of keys) {
    const nested = value[key];
    if (isRecord(nested)) {
      return nested;
    }
  }

  for (const nested of Object.values(value)) {
    if (!isRecord(nested)) {
      continue;
    }

    const found = findRecord(nested, keys, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Reads a direct record under any recognized key.
 * @param value - Object to read from.
 * @param keys - Candidate property names.
 * @returns - Matching object or null when none is found.
 */
function readRecord(
  value: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> | null {
  for (const key of keys) {
    const nested = value[key];
    if (isRecord(nested)) {
      return nested;
    }
  }

  return null;
}

/**
 * Finds the first value under any recognized key.
 * @param value - Object to search.
 * @param keys - Candidate property names.
 * @param allowNested - Whether nested objects should be searched.
 * @param depth - Current recursion depth.
 * @returns - Matching value or undefined when none is found.
 */
function findValue(
  value: Record<string, unknown>,
  keys: readonly string[],
  allowNested: boolean,
  depth = 0
): unknown {
  if (depth > MAX_SEARCH_DEPTH) {
    return undefined;
  }

  for (const key of keys) {
    if (key in value) {
      return value[key];
    }
  }

  if (!allowNested) {
    return undefined;
  }

  for (const nested of Object.values(value)) {
    if (!isRecord(nested)) {
      continue;
    }

    const found = findValue(nested, keys, allowNested, depth + 1);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

/**
 * Converts a local usage value into a 0-100 percentage when safe.
 * @param value - Unknown value from local JSON.
 * @returns - Finite clamped percentage or null when conversion is not safe.
 */
function toPercent(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampPercent(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const trimmed = value.trim();
    const normalized = trimmed.endsWith("%") ? trimmed.slice(0, -1) : trimmed;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? clampPercent(parsed) : null;
  }

  return null;
}

/**
 * Clamps and rounds a percentage value.
 * @param value - Percentage value to clamp.
 * @returns - Percentage between 0 and 100 with one decimal place.
 */
function clampPercent(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 100) * 10) / 10;
}

/**
 * Converts an unknown value into a non-empty string when safe.
 * @param value - Unknown value from local JSON.
 * @returns - Non-empty string or null when conversion is not safe.
 */
function readStringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

/**
 * Checks whether a value is a plain JSON object.
 * @param value - Unknown value to inspect.
 * @returns - True when the value is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
