import type {CouponItem, CouponResult} from "../core/types";
import {formatUnknown, formatWarnings} from "./format-shared";

/**
 * Formats reset-credit coupon data for terminal output.
 * @param result - Normalized reset-coupon result.
 * @returns - Human-readable reset-coupon output ending with a newline.
 */
export function formatCoupons(result: CouponResult): string {
  const lines = [
    "Reset Coupons",
    "",
    `Available coupons: ${formatUnknown(result.available)}`,
    `Earned this period: ${formatUnknown(result.earnedThisPeriod)}`,
    `Next expiration: ${formatNextExpiration(result)}`,
    "",
    "Coupons:",
    ...formatCouponItems(result.items),
  ];

  if (result.warnings.length > 0) {
    lines.push("", "Warnings:", ...formatWarnings(result.warnings));
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Formats the next expiration summary.
 * @param result - Coupon result to inspect.
 * @returns - Human-readable next expiration text.
 */
function formatNextExpiration(result: CouponResult): string {
  if (!result.nextExpirationIn) {
    return "Unknown";
  }

  return result.nextExpirationDate
    ? `${result.nextExpirationDate} (${result.nextExpirationIn})`
    : result.nextExpirationIn;
}

/**
 * Formats all coupon summary lines.
 * @param items - Reset-credit coupons to format.
 * @returns - Coupon lines, or an empty-state line.
 */
function formatCouponItems(items: CouponItem[]): string[] {
  if (items.length === 0) {
    return ["none"];
  }

  return items.map(formatCouponItem);
}

/**
 * Formats one reset-credit coupon summary line.
 * @param item - Reset-credit coupon to format.
 * @returns - Human-readable coupon summary line.
 */
function formatCouponItem(item: CouponItem): string {
  return `${item.index}. ${formatCouponStatus(item.status)} expires in ${formatUnknown(item.expiresIn)}`;
}

/**
 * Formats a coupon status for display.
 * @param value - Raw coupon status.
 * @returns -Title-cased status, or Unknown.
 */
function formatCouponStatus(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
