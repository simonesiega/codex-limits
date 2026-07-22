import {
  formatShortDateTime,
  formatTime,
  isSameLocalDate,
  parseDateValue,
} from "@/package/core/utils/date-time";
import type {CodexLimitsResult, CouponItem, CouponSummary, UsageWindow} from "@/package/core/types";
import type {TuiTone} from "@/package/tui/theme";

export interface TuiUsageCard {
  title: string;
  percent: number | null;
  remainingLabel: string;
  resetLabel: string;
  tone: TuiTone;
}

export interface TuiCouponRow {
  index: number;
  status: string;
  available: boolean;
  expires: string;
  expiresOn: string;
}

export interface TuiCouponSummaryCard {
  availableCoupons: string;
  earnedThisPeriod: string;
  nextExpiration: string;
  timeLeft: string;
}

export interface TuiViewModel {
  width: number;
  stacked: boolean;
  couponsStacked: boolean;
  usageCards: TuiUsageCard[];
  usageEmptyLabel: string;
  couponSummary: TuiCouponSummaryCard;
  couponRows: TuiCouponRow[];
  couponEmptyLabel: string;
}

/** Maps normalized core data into display-only values consumed by Ink components. */
export function createTuiViewModel(
  result: CodexLimitsResult,
  width: number,
  now: Date = new Date()
): TuiViewModel {
  const usageCards = [
    result.windows.fiveHour ? createUsageCard(result.windows.fiveHour, now) : null,
    result.windows.weekly ? createUsageCard(result.windows.weekly, now) : null,
  ].filter((card): card is TuiUsageCard => card !== null);

  return {
    width,
    stacked: width < 86,
    couponsStacked: width < 94,
    usageCards,
    usageEmptyLabel: "Usage data unavailable.",
    couponSummary: createCouponSummary(result.coupons),
    couponRows: createCouponRows(result.coupons),
    couponEmptyLabel:
      !result.coupons || result.coupons.status === "unavailable"
        ? "Coupon data unavailable."
        : "No reset coupons available.",
  };
}

function createUsageCard(window: UsageWindow, now: Date): TuiUsageCard {
  const percent = window.remainingPercent;

  return {
    title: window.label,
    percent,
    remainingLabel: percent === null ? "Unknown remaining" : `${Math.round(percent)}% remaining`,
    resetLabel: formatResetLabel(window, now),
    tone: toneForPercent(percent),
  };
}

function createCouponSummary(coupons: CouponSummary | null): TuiCouponSummaryCard {
  return {
    availableCoupons: formatUnknown(coupons?.available ?? null),
    earnedThisPeriod: formatUnknown(coupons?.earnedThisPeriod ?? null),
    nextExpiration: formatSummaryExpiration(coupons),
    timeLeft: formatTuiDuration(coupons?.nextExpirationIn ?? null),
  };
}

function createCouponRows(coupons: CouponSummary | null): TuiCouponRow[] {
  return (coupons?.items ?? []).map(formatCouponRow);
}

function formatCouponRow(item: CouponItem): TuiCouponRow {
  const available = (item.status ?? "").toLowerCase() === "available";

  return {
    index: item.index,
    status: available ? "Available" : titleCase(item.status ?? "unknown"),
    available,
    expires: item.expiresIn
      ? `expires in ${formatTuiDuration(item.expiresIn)}`
      : "expiration unknown",
    expiresOn: formatCompactCouponDate(item.expiresAt, false),
  };
}

function formatSummaryExpiration(coupons: CouponSummary | null): string {
  const next =
    coupons?.items.find((item) => item.status?.toLowerCase() === "available") ??
    coupons?.items[0] ??
    null;
  return next ? formatCompactCouponDate(next.expiresAt, true) : "Unknown";
}

function formatCompactCouponDate(value: string | null, includeYear: boolean): string {
  const date = parseDateValue(value);
  if (!date) {
    return "Unknown";
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  const months = [
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
  const base = `${weekdays[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
  return includeYear ? `${base} ${date.getFullYear()}` : base;
}

function formatTuiDuration(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

  const parts = value.split(" ").filter((part) => !part.endsWith("s"));
  return parts.length > 0 ? parts.join(" ") : "0m";
}

function formatResetLabel(window: UsageWindow, now: Date): string {
  const resetDate = parseDateValue(window.resetsAt);
  if (resetDate) {
    return isSameLocalDate(resetDate, now)
      ? `Resets at ${formatTime(resetDate)}`
      : `Resets on ${formatShortDateTime(resetDate)}`;
  }

  return window.resetsIn ? `Resets in ${window.resetsIn}` : "Reset time unknown";
}

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

function formatUnknown(value: number | string | null): string {
  return value === null ? "Unknown" : String(value);
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
