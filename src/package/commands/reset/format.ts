import type {CouponItem, ResetCouponResult} from "@/package/core/types";

/** Formats the review shown before an irreversible coupon redemption. */
export function formatResetRecap(
  coupon: CouponItem,
  selection: "index" | "soonest",
  availableCount: number | null
): string {
  const selectionLabel =
    selection === "soonest" ? "soonest-expiring available coupon" : "selected coupon index";

  return [
    "Codex usage reset",
    "",
    `Selected coupon: #${coupon.index} (${selectionLabel})`,
    `Expiration: ${formatExpiration(coupon)}`,
    `Available coupons: ${availableCount ?? "Unknown"}`,
    "",
    "This will consume one coupon and reset your current Codex usage limits.",
    "A consumed coupon cannot be restored.",
    "",
  ].join("\n");
}

/** Formats a safe, user-facing consume outcome. */
export function formatResetOutcome(result: ResetCouponResult): string {
  switch (result.outcome) {
    case "reset":
      return result.windowsReset !== null && result.windowsReset > 0
        ? `Codex usage reset successfully. One coupon was used, and ${result.windowsReset} usage ${result.windowsReset === 1 ? "window was" : "windows were"} reset.\n`
        : "Codex usage reset successfully. One coupon was used.\n";
    case "already-redeemed":
      return "This reset request was already completed. No additional coupon was used.\n";
    case "nothing-to-reset":
      return "Your Codex usage does not need a reset right now. No coupon was used.\n";
    case "no-credit":
      return "The selected reset coupon is no longer available. No coupon was used.\n";
    case "unconfirmed":
      return "The reset result could not be confirmed. Check your limits before trying again.\n";
  }
}

function formatExpiration(coupon: CouponItem): string {
  if (!coupon.expirationDate) {
    return coupon.expiresIn ?? "Unknown";
  }
  return coupon.expiresIn
    ? `${coupon.expirationDate} (${coupon.expiresIn})`
    : coupon.expirationDate;
}
