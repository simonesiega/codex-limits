import type {CouponItem, CouponResult} from "../types";
import {formatDuration, formatLongDate, parseDateValue} from "../utils/date-time";
import {isRecord, readString} from "../utils/unknown";

/**
 * Maps the payload from the live reset coupon endpoint to a `CouponResult` object, handling any malformed data and generating appropriate warnings.
 * @param payload - The raw payload received from the live reset coupon endpoint.
 * @param endpoint - The URL of the live reset coupon endpoint, used for reference in the result.
 * @param now - The current date and time, used for calculating expiration durations.
 * @returns - A `CouponResult` object representing the parsed and validated coupon data, including any warnings about malformed entries.
 */
export function mapResetCouponsPayload(
  payload: unknown,
  endpoint: string,
  now: Date
): CouponResult {
  if (!isRecord(payload) || !hasRecognizedCouponField(payload)) {
    return unavailableCoupons(endpoint, [
      "Live reset coupon endpoint returned an unexpected payload.",
    ]);
  }

  const creditField = readArray(payload, ["credits", "reset_credits", "items"]);
  if (creditField.malformed) {
    return unavailableCoupons(endpoint, [
      "Live reset coupon endpoint returned an unexpected payload.",
    ]);
  }

  const rawCredits = creditField.value;
  const items = rawCredits
    .map((credit, index) => parseCouponItem(credit, index + 1, now))
    .filter((credit): credit is CouponItem => credit !== null)
    .sort(compareCouponsByExpiry)
    .map((credit, index) => ({...credit, index: index + 1}));
  const nextExpiring =
    items.find((item) => item.status?.toLowerCase() === "available") ?? items[0] ?? null;
  const available = readNumber(payload, ["available_count", "availableCount", "available"]);
  const earnedThisPeriod = readNumber(payload, [
    "total_earned_count",
    "earned_this_period",
    "earnedThisPeriod",
    "totalEarnedCount",
  ]);
  const warnings: string[] = [];
  if (rawCredits.length !== items.length) {
    warnings.push("Live reset coupon endpoint ignored malformed coupon entries.");
  }
  if (available.malformed || earnedThisPeriod.malformed) {
    warnings.push("Live reset coupon endpoint ignored malformed summary fields.");
  }

  return {
    status: warnings.length > 0 ? "partial" : "available",
    available: available.value,
    earnedThisPeriod: earnedThisPeriod.value,
    nextExpirationDate: nextExpiring?.expirationDate ?? null,
    nextExpirationIn: nextExpiring?.expiresIn ?? null,
    items,
    warnings,
    source: {
      live: true,
      label: "live Codex reset-credit endpoint",
      endpoint,
    },
  };
}

/**
 * Unavailable coupon result generator, used when the live reset coupon endpoint returns an unexpected payload or is otherwise unavailable.
 * @param endpoint - The URL of the live reset coupon endpoint, used for reference in the result.
 * @param warnings - An array of warning messages to include in the result.
 * @returns - A `CouponResult` object representing the unavailable coupon state.
 */
export function unavailableCoupons(endpoint: string, warnings: string[] = []): CouponResult {
  return {
    status: "unavailable",
    available: null,
    earnedThisPeriod: null,
    nextExpirationDate: null,
    nextExpirationIn: null,
    items: [],
    warnings,
    source: {
      live: false,
      label: "live Codex reset-credit endpoint",
      endpoint,
    },
  };
}

/**
 * Checks if the payload contains any recognized coupon fields.
 * @param payload - The raw payload received from the live reset coupon endpoint.
 * @returns - True if the payload contains any recognized coupon fields, false otherwise.
 */
function hasRecognizedCouponField(payload: Record<string, unknown>): boolean {
  return [
    "credits",
    "reset_credits",
    "items",
    "available_count",
    "availableCount",
    "available",
    "total_earned_count",
    "earned_this_period",
    "earnedThisPeriod",
    "totalEarnedCount",
  ].some((key) => key in payload);
}

/**
 * Parses an individual coupon item from the payload, validating its fields and calculating expiration information.
 * @param value - The raw coupon item value from the payload.
 * @param index - The index of the coupon item in the payload, used for reference in warnings.
 * @param now - The current date and time, used for calculating expiration durations.
 * @returns - A `CouponItem` object representing the parsed and validated coupon item, or null if the item is malformed.
 */
function parseCouponItem(value: unknown, index: number, now: Date): CouponItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawExpiresAt = readString(value, "expires_at") ?? readString(value, "expiresAt");
  const rawGrantedAt = readString(value, "granted_at") ?? readString(value, "grantedAt");
  const expiresAtDate = parseDateValue(rawExpiresAt);
  const grantedAtDate = parseDateValue(rawGrantedAt);
  const rawStatus = readString(value, "status");

  const status = rawStatus && /^[a-z][a-z0-9_-]{0,63}$/i.test(rawStatus) ? rawStatus : null;
  const grantedAt = grantedAtDate ? rawGrantedAt : null;
  const expiresAt = expiresAtDate ? rawExpiresAt : null;
  if (!status && !grantedAt && !expiresAt) {
    return null;
  }

  return {
    index,
    status,
    grantedAt,
    expiresAt,
    expirationDate: expiresAtDate ? formatLongDate(expiresAtDate) : null,
    expiresIn: expiresAtDate ? formatDuration(expiresAtDate.getTime() - now.getTime()) : null,
  };
}

/**
 * Compares two coupon items by their expiration dates, used for sorting coupon items in ascending order of expiration.
 * @param left - The first coupon item to compare.
 * @param right - The second coupon item to compare.
 * @returns - A negative number if the first item expires before the second, a positive number if it expires after, or zero if they have the same expiration date.
 */
function compareCouponsByExpiry(left: CouponItem, right: CouponItem): number {
  return dateSortValue(left.expiresAt) - dateSortValue(right.expiresAt);
}

/**
 * Sorts a date string into a numeric value representing the time in milliseconds since the Unix epoch.
 * @param value - The date string to sort.
 * @returns - A numeric value representing the time in milliseconds since the Unix epoch, or positive infinity if the date string is null or invalid.
 */
function dateSortValue(value: string | null): number {
  const date = parseDateValue(value);
  return date ? date.getTime() : Number.POSITIVE_INFINITY;
}

/**
 * Reads an array from a record object, checking for the presence of specified keys and validating that the value is an array.
 * @param value - The record object from which to read the array.
 * @param keys - An array of keys to check for in the record object.
 * @returns - An object containing the array value (or an empty array if not found) and a boolean indicating whether the value was malformed.
 */
function readArray(
  value: Record<string, unknown>,
  keys: readonly string[]
): {value: unknown[]; malformed: boolean} {
  let found = false;
  for (const key of keys) {
    if (!(key in value)) {
      continue;
    }
    found = true;
    const field = value[key];
    if (Array.isArray(field)) {
      return {value: field, malformed: false};
    }
  }
  return {value: [], malformed: found};
}

/**
 * Reads a number from a record object, checking for the presence of specified keys and validating that the value is a finite non-negative number.
 * @param value - The record object from which to read the number.
 * @param keys - An array of keys to check for in the record object.
 * @returns - An object containing the number value (or null if not found) and a boolean indicating whether the value was malformed.
 */
function readNumber(
  value: Record<string, unknown>,
  keys: readonly string[]
): {value: number | null; malformed: boolean} {
  let found = false;
  for (const key of keys) {
    if (!(key in value)) {
      continue;
    }
    found = true;
    const field = value[key];
    if (typeof field === "number" && Number.isFinite(field) && field >= 0) {
      return {value: field, malformed: false};
    }
  }
  return {value: null, malformed: found};
}
