/**
 * @fileoverview Shared core logic for selection. This module is part of the canonical data, normalization, or safety layer reused by commands, the TUI, and agent adapters.
 */
import type {CouponItem, CouponResult} from "@/package/core/types";
import {parseDateValue} from "@/package/core/utils/date-time";

export type ResetCouponSelection = {kind: "index"; couponIndex: number} | {kind: "soonest"};

export type ResetCouponSelectionResult =
  | {kind: "selected"; coupon: CouponItem}
  | {kind: "not-found"}
  | {kind: "not-available"}
  | {kind: "none-available"}
  | {kind: "details-unavailable"};

/** Selects one currently available coupon by display index or earliest expiration. */
export function selectResetCoupon(
  result: CouponResult,
  selection: ResetCouponSelection
): ResetCouponSelectionResult {
  if (selection.kind === "index") {
    const coupon = result.items.find((item) => item.index === selection.couponIndex);
    if (!coupon) {
      return {kind: "not-found"};
    }
    if (!isAvailable(coupon)) {
      return {kind: "not-available"};
    }
    return isRedeemable(coupon) ? {kind: "selected", coupon} : {kind: "details-unavailable"};
  }

  const available = result.items.filter(isAvailable);
  const availableCountMismatch = result.available !== null && result.available !== available.length;
  if (
    result.status === "partial" ||
    availableCountMismatch ||
    available.some((coupon) => !isRedeemable(coupon) || parseDateValue(coupon.expiresAt) === null)
  ) {
    return {kind: "details-unavailable"};
  }

  const coupon = available.sort(
    (left, right) => expirationSortValue(left) - expirationSortValue(right)
  )[0];
  if (coupon) {
    return {kind: "selected", coupon};
  }

  return (result.available ?? 0) > 0 ? {kind: "details-unavailable"} : {kind: "none-available"};
}

/** Requires an explicitly available status rather than inferring availability from missing fields. */
function isAvailable(coupon: CouponItem): boolean {
  return coupon.status?.toLowerCase() === "available";
}

/** Requires both availability and a validated opaque redemption identifier. */
function isRedeemable(coupon: CouponItem): boolean {
  return coupon.id !== null && coupon.resetType === "codex_rate_limits";
}

/** Places unverifiable expirations last so soonest selection can fail closed. */
function expirationSortValue(coupon: CouponItem): number {
  return parseDateValue(coupon.expiresAt)?.getTime() ?? Number.POSITIVE_INFINITY;
}
