import {isValidCouponId} from "@/package/core/coupons/coupon-id";
import type {CouponItem, CouponResult} from "@/package/core/types";
import {formatDuration, formatLongDate, parseDateValue} from "@/package/core/utils/date-time";
import {isRecord, readString} from "@/package/core/utils/unknown";

const CREDIT_KEYS = ["credits", "reset_credits", "items"] as const;
const AVAILABLE_KEYS = ["available_count", "availableCount", "available"] as const;
const EARNED_KEYS = [
  "total_earned_count",
  "earned_this_period",
  "earnedThisPeriod",
  "totalEarnedCount",
] as const;
const MAX_TIMESTAMP_LENGTH = 64;
const RFC_3339_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|[+-](\d{2}):(\d{2}))$/i;

/** Validates and normalizes an untrusted reset-credit endpoint payload. */
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

  const creditField = readArray(payload, CREDIT_KEYS);
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
  const available = readNonNegativeInteger(payload, AVAILABLE_KEYS);
  const earnedThisPeriod = readNonNegativeInteger(payload, EARNED_KEYS);
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

/** Builds the stable empty coupon result used for all unavailable paths. */
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

function hasRecognizedCouponField(payload: Record<string, unknown>): boolean {
  return [...CREDIT_KEYS, ...AVAILABLE_KEYS, ...EARNED_KEYS].some((key) => key in payload);
}

function parseCouponItem(value: unknown, index: number, now: Date): CouponItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawId = value.id;
  const id = typeof rawId === "string" && isValidCouponId(rawId) ? rawId : null;
  const rawResetType = value.reset_type ?? value.resetType;
  const resetType =
    typeof rawResetType === "string" && /^[a-z][a-z0-9_-]{0,63}$/i.test(rawResetType)
      ? rawResetType
      : null;
  const hasExpiresAt = "expires_at" in value || "expiresAt" in value;
  const hasGrantedAt = "granted_at" in value || "grantedAt" in value;
  const rawExpiresAt = readString(value, "expires_at") ?? readString(value, "expiresAt");
  const rawGrantedAt = readString(value, "granted_at") ?? readString(value, "grantedAt");
  const expiresAtDate = parseCouponTimestamp(rawExpiresAt);
  const grantedAtDate = parseCouponTimestamp(rawGrantedAt);
  const rawStatus = readString(value, "status");
  const status = rawStatus && /^[a-z][a-z0-9_-]{0,63}$/i.test(rawStatus) ? rawStatus : null;
  const grantedAt = grantedAtDate ? rawGrantedAt : null;
  const expiresAt = expiresAtDate ? rawExpiresAt : null;

  if (
    ("id" in value && !id) ||
    (hasGrantedAt && !grantedAtDate) ||
    (hasExpiresAt && !expiresAtDate) ||
    (!status && !grantedAt && !expiresAt)
  ) {
    return null;
  }

  return {
    id,
    resetType,
    index,
    status,
    grantedAt,
    expiresAt,
    expirationDate: expiresAtDate ? formatLongDate(expiresAtDate) : null,
    expiresIn: expiresAtDate ? formatDuration(expiresAtDate.getTime() - now.getTime()) : null,
  };
}

function parseCouponTimestamp(value: string | null): Date | null {
  if (!value || value.length > MAX_TIMESTAMP_LENGTH) {
    return null;
  }

  const match = RFC_3339_TIMESTAMP.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function compareCouponsByExpiry(left: CouponItem, right: CouponItem): number {
  return dateSortValue(left.expiresAt) - dateSortValue(right.expiresAt);
}

function dateSortValue(value: string | null): number {
  return parseDateValue(value)?.getTime() ?? Number.POSITIVE_INFINITY;
}

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

function readNonNegativeInteger(
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
    if (typeof field === "number" && Number.isInteger(field) && field >= 0) {
      return {value: field, malformed: false};
    }
  }
  return {value: null, malformed: found};
}
