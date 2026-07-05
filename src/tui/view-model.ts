import { formatShortDateTime, formatTime, isSameLocalDate, parseDateValue } from "../core/utils/date-time";
import type { CodexLimitsResult, CouponItem, CouponSummary, UsageWindow } from "../core/types";
import type { TuiTone } from "./theme";

/** One usage card in the usage limits panel. */
export interface TuiUsageCard {
  /** Card title. */
  title: string;
  /** Numeric remaining percent, if known. */
  percent: number | null;
  /** Display label for remaining percentage. */
  remainingLabel: string;
  /** Reset text shown below the progress bar. */
  resetLabel: string;
  /** Color tone derived from remaining capacity. */
  tone: TuiTone;
}

/** One coupon row in the reset-coupons panel. */
export interface TuiCouponRow {
  /** 1-based coupon index. */
  index: number;
  /** Coupon status label. */
  status: string;
  /** Whether the coupon is currently available. */
  available: boolean;
  /** Expiration label such as expires in 7d 4h 38m. */
  expires: string;
  /** Compact expiration date such as Sun 12 Jul. */
  expiresOn: string;
}

/** Summary values shown in the reset-coupons summary card. */
export interface TuiCouponSummaryCard {
  /** Available coupon count shown as the strongest value. */
  availableCoupons: string;
  /** Coupons earned in the current period. */
  earnedThisPeriod: string;
  /** Next expiration date. */
  nextExpiration: string;
  /** Time left until next expiration. */
  timeLeft: string;
}

/** Display model consumed by Ink components. */
export interface TuiViewModel {
  /** Terminal width used for responsive layout decisions. */
  width: number;
  /** Whether cards should stack vertically. */
  stacked: boolean;
  /** Whether reset-coupon cards should stack vertically. */
  couponsStacked: boolean;
  /** Usage limit cards. */
  usageCards: TuiUsageCard[];
  /** Reset coupon summary card values. */
  couponSummary: TuiCouponSummaryCard;
  /** Reset coupon list rows. */
  couponRows: TuiCouponRow[];
  /** Empty state for coupon rows. */
  couponEmptyLabel: string;
}

/**
 * Maps normalized core data into a TUI-specific display model.
 *
 * @param result - Normalized Codex limits result from the core.
 * @param width - Terminal width used for responsive layout.
 * @param now - Current time used for relative labels.
 * @returns TUI view model with no domain parsing logic.
 */
export function createTuiViewModel(result: CodexLimitsResult, width: number, now: Date = new Date()): TuiViewModel {
  return {
    width,
    stacked: width < 86,
    couponsStacked: width < 94,
    usageCards: [createUsageCard(result.windows.fiveHour, "5-hour usage limit", now), createUsageCard(result.windows.weekly, "Weekly usage limit", now)],
    couponSummary: createCouponSummary(result.coupons),
    couponRows: createCouponRows(result.coupons),
    couponEmptyLabel: !result.coupons || result.coupons.status === "unavailable" ? "Coupon data unavailable." : "No reset coupons available.",
  };
}

/**
 * Builds a usage card for one usage window.
 *
 * @param window - Normalized usage window.
 * @param fallbackTitle - Title to show when the window is missing.
 * @param now - Current time used for reset labels.
 * @returns Usage card view model.
 */
function createUsageCard(window: UsageWindow | null, fallbackTitle: string, now: Date): TuiUsageCard {
  const percent = window?.remainingPercent ?? null;

  return {
    title: window?.label ?? fallbackTitle,
    percent,
    remainingLabel: percent === null ? "Unknown remaining" : `${Math.round(percent)}% remaining`,
    resetLabel: formatResetLabel(window, now),
    tone: toneForPercent(percent),
  };
}

/**
 * Builds summary rows for the reset-coupons panel.
 *
 * @param coupons - Coupon summary from the core.
 * @returns Coupon summary rows.
 */
function createCouponSummary(coupons: CouponSummary | null): TuiCouponSummaryCard {
  return {
    availableCoupons: formatUnknown(coupons?.available ?? null),
    earnedThisPeriod: formatUnknown(coupons?.earnedThisPeriod ?? null),
    nextExpiration: formatSummaryExpiration(coupons),
    timeLeft: formatTuiDuration(coupons?.nextExpirationIn ?? null),
  };
}

/**
 * Builds coupon list rows for the reset-coupons panel.
 *
 * @param coupons - Coupon summary from the core.
 * @returns Coupon list rows.
 */
function createCouponRows(coupons: CouponSummary | null): TuiCouponRow[] {
  return (coupons?.items ?? []).map(formatCouponRow);
}

/**
 * Formats one coupon row for the TUI.
 *
 * @param item - Normalized coupon item.
 * @returns TUI coupon row.
 */
function formatCouponRow(item: CouponItem): TuiCouponRow {
  const available = (item.status ?? "").toLowerCase() === "available";

  return {
    index: item.index,
    status: available ? "Available" : titleCase(item.status ?? "unknown"),
    available,
    expires: item.expiresIn ? `expires in ${formatTuiDuration(item.expiresIn)}` : "expiration unknown",
    expiresOn: formatCompactCouponDate(item.expiresAt, false),
  };
}

/**
 * Formats the next coupon expiration for the summary card.
 *
 * @param coupons - Coupon summary from the core.
 * @returns Short date with year, or Unknown when unavailable.
 */
function formatSummaryExpiration(coupons: CouponSummary | null): string {
  const next = coupons?.items.find((item) => item.status === "available") ?? coupons?.items[0] ?? null;
  return next ? formatCompactCouponDate(next.expiresAt, true) : "Unknown";
}

/**
 * Formats a coupon expiration timestamp as a compact TUI date.
 *
 * @param value - Expiration timestamp from the normalized coupon item.
 * @returns Compact date such as Sun 12 Jul, or Unknown when unavailable.
 */
function formatCompactCouponDate(value: string | null, includeYear: boolean): string {
  const date = parseDateValue(value);
  if (!date) {
    return "Unknown";
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
  const base = `${weekdays[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
  return includeYear ? `${base} ${date.getFullYear()}` : base;
}

/**
 * Removes seconds from coupon durations shown in the TUI.
 *
 * @param value - Compact duration from the core.
 * @returns Duration without second units, or Unknown when missing.
 */
function formatTuiDuration(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

  const parts = value.split(" ").filter((part) => !part.endsWith("s"));
  return parts.length > 0 ? parts.join(" ") : "0m";
}

/**
 * Formats reset text for a usage card.
 *
 * @param window - Normalized usage window.
 * @param now - Current time used for same-day formatting.
 * @returns Human-readable reset label.
 */
function formatResetLabel(window: UsageWindow | null, now: Date): string {
  if (!window) {
    return "Reset time unknown";
  }

  const resetDate = parseDateValue(window.resetsAt);
  if (resetDate) {
    return isSameLocalDate(resetDate, now) ? `Resets at ${formatTime(resetDate)}` : `Resets on ${formatShortDateTime(resetDate)}`;
  }

  return window.resetsIn ? `Resets in ${window.resetsIn}` : "Reset time unknown";
}

/**
 * Selects a display tone from remaining percentage.
 *
 * @param percent - Remaining percentage.
 * @returns Color tone for the usage card.
 */
function toneForPercent(percent: number | null): TuiTone {
  if (percent === null) {
    return "gray";
  }

  if (percent >= 50) {
    return "green";
  }

  if (percent >= 15) {
    return "yellow";
  }

  return "red";
}

/**
 * Formats nullable values using the TUI unknown label.
 *
 * @param value - Value to format.
 * @returns String value or Unknown.
 */
function formatUnknown(value: number | string | null): string {
  return value === null ? "Unknown" : String(value);
}

/**
 * Title-cases a status-like string.
 *
 * @param value - String to title-case.
 * @returns Title-cased string.
 */
function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
