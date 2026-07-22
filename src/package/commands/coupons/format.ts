import {formatUnknown, formatWarnings} from "@/package/commands/format-shared";
import type {CouponItem, CouponResult} from "@/package/core/types";

/** Formats normalized reset-credit coupons as stable plain text. */
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

function formatNextExpiration(result: CouponResult): string {
  if (!result.nextExpirationIn) {
    return "Unknown";
  }
  return result.nextExpirationDate
    ? `${result.nextExpirationDate} (${result.nextExpirationIn})`
    : result.nextExpirationIn;
}

function formatCouponItems(items: readonly CouponItem[]): string[] {
  return items.length > 0 ? items.map(formatCouponItem) : ["none"];
}

function formatCouponItem(item: CouponItem): string {
  return `${item.index}. ${formatCouponStatus(item.status)} expires in ${formatUnknown(item.expiresIn)}`;
}

function formatCouponStatus(value: string | null): string {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : "Unknown";
}
