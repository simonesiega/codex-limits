const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Store for optional formatting controls when formatting a duration.
 */
export interface DurationFormatOptions {
  includeSeconds?: boolean;
}

/**
 * Formats a future duration as compact human text.
 * @param durationMs - Milliseconds until the target time.
 * @param options - Optional formatting controls.
 * @returns - Compact duration such as 7d 4h 38m.
 */
export function formatDuration(durationMs: number, options: DurationFormatOptions = {}): string {
  const includeSeconds = options.includeSeconds ?? false;
  let remainingSeconds = Math.max(Math.floor(durationMs / 1000), 0);
  const days = Math.floor(remainingSeconds / 86_400);
  remainingSeconds %= 86_400;
  const hours = Math.floor(remainingSeconds / 3_600);
  remainingSeconds %= 3_600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (includeSeconds && seconds > 0) {
    parts.push(`${seconds}s`);
  }

  return parts.length > 0 ? parts.join(" ") : includeSeconds ? `${seconds}s` : "0m";
}

/**
 * Parses a reset timestamp from a number, numeric string, or date string.
 * @param value - Unknown timestamp value.
 * @returns - Date when conversion is safe, otherwise null.
 */
export function parseDateValue(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestampMs = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(timestampMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const trimmed = value.trim();
    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue)) {
      return parseDateValue(numericValue);
    }

    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Formats a date as a stable long local date.
 * @param date - Date to format.
 * @returns - Long date such as Monday 4 July 2026.
 */
export function formatLongDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Formats a date as a compact local date and time.
 * @param date - Date to format.
 * @returns - Compact date such as 7 Jul 2026 11:40.
 */
export function formatShortDateTime(date: Date): string {
  return `${date.getDate()} ${SHORT_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()} ${formatTime(date)}`;
}

/**
 * Formats a date as local HH:mm time.
 * @param date - Date to format.
 * @returns - Time such as 19:55.
 */
export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Checks whether two dates fall on the same local calendar day.
 * @param left - First date to compare.
 * @param right - Second date to compare.
 * @returns -True when both dates have the same local year, month, and day.
 */
export function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/**
 * Formats a date in local time with an explicit offset.
 * @param date - Date to format.
 * @returns - Local ISO-like timestamp with timezone offset and no milliseconds.
 */
export function formatLocalDateTime(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainderMinutes = absoluteOffset % 60;

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}${sign}${pad(offsetHours)}:${pad(offsetRemainderMinutes)}`;
}

/**
 * Formats elapsed time from an ISO timestamp to now.
 * @param isoTimestamp - ISO timestamp to compare with now.
 * @param now - Current time used for comparison.
 * @returns - Just now, an ago duration, or unknown.
 */
export function formatRelativeTime(isoTimestamp: string | null, now: Date = new Date()): string {
  const date = parseDateValue(isoTimestamp);
  if (!date) {
    return "Unknown";
  }

  const elapsedMs = Math.max(now.getTime() - date.getTime(), 0);
  if (elapsedMs < 60_000) {
    return "Just now";
  }

  return `${formatDuration(elapsedMs)} ago`;
}

/**
 * Formats a number as two digits.
 * @param value - Number to pad.
 * @returns - Two-character string.
 */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}
