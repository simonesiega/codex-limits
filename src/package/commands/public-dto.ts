import type {CodexLimitsResult, CouponItem, CouponSummary, UsageWindow} from "../core/types";
import {redactWarnings} from "../core/utils/redact";

/**
 * Store the JSON representation of a usage window for the `codex-limits --json` command.
 */
export interface UsageWindowDto {
  label: string;
  remainingPercent: number | null;
  usedPercent: number | null;
  resetsAt: string | null;
  resetsIn: string | null;
}

/**
 * Store the JSON representation of a reset-credit coupon item for the `codex-limits --json` command.
 */
export interface CouponItemDto {
  index: number;
  status: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  expirationDate: string | null;
  expiresIn: string | null;
}

/**
 * Store the JSON representation of reset-credit coupon data for the `codex-limits --json` command.
 */
export interface CouponSummaryDto {
  available: number | null;
  earnedThisPeriod: number | null;
  nextExpirationDate: string | null;
  nextExpirationIn: string | null;
  items: CouponItemDto[];
  warnings: string[];
}

/**
 * Store the JSON representation of the overall limits data for the `codex-limits --json` command.
 */
export interface CodexLimitsDto {
  windows: {
    fiveHour: UsageWindowDto | null;
    weekly: UsageWindowDto | null;
  };
  coupons: CouponSummaryDto | null;
  warnings: string[];
}

/**
 * Converts the normalized limits result into the public JSON contract.
 * @param result - The normalized limits result.
 * @returns - The public JSON representation of the limits data.
 */
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

/**
 * Converts the normalized coupon summary into the public JSON contract.
 * @param result - The normalized coupon summary.
 * @returns - The public JSON representation of the coupon summary.
 */
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

/**
 * Converts the normalized usage window into the public JSON contract.
 * @param window - The normalized usage window.
 * @returns - The public JSON representation of the usage window.
 */
function toUsageWindowDto(window: UsageWindow | null): UsageWindowDto | null {
  if (!window) {
    return null;
  }
  return {
    label: window.label,
    remainingPercent: window.remainingPercent,
    usedPercent: window.usedPercent,
    resetsAt: window.resetsAt,
    resetsIn: window.resetsIn,
  };
}

/**
 * Converts the normalized coupon item into the public JSON contract.
 * @param item - The normalized coupon item.
 * @returns - The public JSON representation of the coupon item.
 */
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
