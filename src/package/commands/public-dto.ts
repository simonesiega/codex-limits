import type {CodexLimitsResult, CouponItem, CouponSummary, UsageWindow} from "@/package/core/types";
import {redactWarnings} from "@/package/core/utils/redact";

/** Stable JSON representation of a usage window. */
export interface UsageWindowDto {
  label: string;
  remainingPercent: number | null;
  usedPercent: number | null;
  resetsAt: string | null;
  resetsIn: string | null;
}

/** Stable JSON representation of one reset-credit coupon. */
export interface CouponItemDto {
  index: number;
  status: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  expirationDate: string | null;
  expiresIn: string | null;
}

/** Stable JSON representation of reset-credit coupon data. */
export interface CouponSummaryDto {
  available: number | null;
  earnedThisPeriod: number | null;
  nextExpirationDate: string | null;
  nextExpirationIn: string | null;
  items: CouponItemDto[];
  warnings: string[];
}

/** Stable JSON representation returned by `codex-limits --json`. */
export interface CodexLimitsDto {
  windows: {
    fiveHour: UsageWindowDto | null;
    weekly: UsageWindowDto | null;
  };
  coupons: CouponSummaryDto | null;
  warnings: string[];
}

/** Selects and redacts the fields in the public limits JSON contract. */
export function toCodexLimitsDto(result: CodexLimitsResult): CodexLimitsDto {
  return {
    windows: {
      fiveHour: toUsageWindowDto(result.windows.fiveHour),
      weekly: toUsageWindowDto(result.windows.weekly),
    },
    coupons: result.coupons ? toCouponSummaryDto(result.coupons) : null,
    warnings: redactWarnings(result.warnings),
  };
}

/** Selects and redacts the fields in the public coupon JSON contract. */
export function toCouponSummaryDto(result: CouponSummary): CouponSummaryDto {
  return {
    available: result.available,
    earnedThisPeriod: result.earnedThisPeriod,
    nextExpirationDate: result.nextExpirationDate,
    nextExpirationIn: result.nextExpirationIn,
    items: result.items.map(toCouponItemDto),
    warnings: redactWarnings(result.warnings),
  };
}

function toUsageWindowDto(window: UsageWindow | null): UsageWindowDto | null {
  return window
    ? {
        label: window.label,
        remainingPercent: window.remainingPercent,
        usedPercent: window.usedPercent,
        resetsAt: window.resetsAt,
        resetsIn: window.resetsIn,
      }
    : null;
}

function toCouponItemDto(item: CouponItem): CouponItemDto {
  return {
    index: item.index,
    status: item.status,
    grantedAt: item.grantedAt,
    expiresAt: item.expiresAt,
    expirationDate: item.expirationDate,
    expiresIn: item.expiresIn,
  };
}
