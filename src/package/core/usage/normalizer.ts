import {formatDuration, parseDateValue} from "@/package/core/utils/date-time";
import {redactSensitiveText} from "@/package/core/utils/redact";
import {isRecord} from "@/package/core/utils/unknown";
import type {
  AvailabilityStatus,
  CodexSessionReadResult,
  CodexStateReadResult,
  LocalUsageResult,
  UsageResult,
  UsageSource,
  UsageWindow,
  UsageWindows,
} from "@/package/core/types";

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

/** Normalizes the latest bounded local session snapshot. */
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

/** Maps recognized primary and secondary rate-limit windows. */
export function parseUsageWindowsFromRateLimits(
  rateLimits: Record<string, unknown>,
  now: Date = new Date()
): UsageWindows {
  return {
    fiveHour: parseUsageWindow(readRecord(rateLimits, FIVE_HOUR_KEYS), FIVE_HOUR_LABEL, now),
    weekly: parseUsageWindow(readRecord(rateLimits, WEEKLY_KEYS), WEEKLY_LABEL, now),
  };
}

export function withUsageSource(result: LocalUsageResult, source: UsageSource): UsageResult {
  return {...result, source};
}

/** Builds a sourced usage result and derives its availability. */
export function buildUsageResult(
  windows: UsageWindows,
  source: UsageSource,
  warnings: string[] = []
): UsageResult {
  return {...buildLocalUsageResult(windows, warnings), source};
}

/** Merges usage windows found in safe local state files. */
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

/** Builds the stable unavailable local usage shape. */
export function unavailableLocalUsage(warnings: string[] = []): LocalUsageResult {
  return {
    status: "unavailable",
    windows: {fiveHour: null, weekly: null},
    warnings,
  };
}

/** Fills gaps in preferred local usage with fallback state data. */
export function mergeLocalUsage(
  primary: LocalUsageResult,
  fallback: LocalUsageResult
): LocalUsageResult {
  const windows = mergeUsageWindows(primary.windows, fallback.windows);

  return buildLocalUsageResult(windows, [...primary.warnings, ...fallback.warnings]);
}

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

function buildLocalUsageResult(windows: UsageWindows, warnings: string[]): LocalUsageResult {
  return {
    status: statusForWindows(windows),
    windows,
    warnings,
  };
}

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

function mergeUsageWindows(primary: UsageWindows, fallback: UsageWindows): UsageWindows {
  return {
    fiveHour: mergeUsageWindow(primary.fiveHour, fallback.fiveHour, FIVE_HOUR_LABEL),
    weekly: mergeUsageWindow(primary.weekly, fallback.weekly, WEEKLY_LABEL),
  };
}

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

function hasWindowData(window: UsageWindow | null): boolean {
  return (
    window !== null &&
    (window.remainingPercent !== null ||
      window.usedPercent !== null ||
      window.resetsAt !== null ||
      window.resetsIn !== null)
  );
}

function isCompleteWindow(window: UsageWindow | null): boolean {
  return (
    window !== null &&
    window.remainingPercent !== null &&
    window.usedPercent !== null &&
    (window.resetsAt !== null || window.resetsIn !== null)
  );
}

// Local state shapes vary across Codex versions, so searches are recursive but depth-bounded.
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

function clampPercent(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 100) * 10) / 10;
}

function readStringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}
