const MAX_COUPON_ID_LENGTH = 512;
const UNSAFE_COUPON_ID_CHARACTER = /[\u0000-\u0020\u007f-\u009f]/;

/** Validates a bounded opaque reset-coupon identifier before matching or sending it. */
export function isValidCouponId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_COUPON_ID_LENGTH &&
    !UNSAFE_COUPON_ID_CHARACTER.test(value)
  );
}
