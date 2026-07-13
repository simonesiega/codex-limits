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

export interface DurationFormatOptions {
  includeSeconds?: boolean;
}

/** Formats a non-negative compact duration such as `7d 4h 38m`. */
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

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (includeSeconds && seconds > 0) parts.push(`${seconds}s`);

  return parts.length > 0 ? parts.join(" ") : includeSeconds ? `${seconds}s` : "0m";
}

/** Parses seconds, milliseconds, numeric strings, or date strings into a valid date. */
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

export function formatLongDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatShortDateTime(date: Date): string {
  return `${date.getDate()} ${SHORT_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()} ${formatTime(date)}`;
}

export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/** Formats local time with an explicit offset and no seconds or milliseconds. */
export function formatLocalDateTime(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainderMinutes = absoluteOffset % 60;

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}${sign}${pad(offsetHours)}:${pad(offsetRemainderMinutes)}`;
}

export function formatRelativeTime(isoTimestamp: string | null, now: Date = new Date()): string {
  const date = parseDateValue(isoTimestamp);
  if (!date) {
    return "Unknown";
  }

  const elapsedMs = Math.max(now.getTime() - date.getTime(), 0);
  return elapsedMs < 60_000 ? "Just now" : `${formatDuration(elapsedMs)} ago`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
