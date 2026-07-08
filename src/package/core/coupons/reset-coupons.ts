import {getCodexCredentialStatus, resolveCodexCredentials} from "../auth/codex-auth";
import {formatDuration, formatLongDate, parseDateValue} from "../utils/date-time";
import type {
  CouponCredentialStatus,
  CouponItem,
  CouponOptions,
  CouponResult,
  FetchLike,
} from "../types";

export const LIVE_RESET_COUPONS_ENDPOINT =
  "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Fetches reset-credit coupons from the explicit live Codex endpoint.
 *
 * @param options - Environment, auth, fetch, endpoint, timeout, and clock overrides.
 * @returns Normalized reset-coupon result that never includes tokens.
 */
export async function getResetCoupons(options: CouponOptions = {}): Promise<CouponResult> {
  const endpoint = options.endpoint ?? LIVE_RESET_COUPONS_ENDPOINT;
  const credentials = await resolveCodexCredentials(options);

  if (!credentials) {
    return unavailableCoupons(endpoint, [
      "Live reset coupons require a readable Codex auth.json file or CODEX_LIMITS_ACCESS_TOKEN and CODEX_LIMITS_ACCOUNT_ID.",
    ]);
  }

  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (!fetchImplementation) {
    return unavailableCoupons(endpoint, [
      "This runtime does not provide fetch for live reset coupon lookup.",
    ]);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await (fetchImplementation as FetchLike)(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "ChatGPT-Account-ID": credentials.accountId,
        "OpenAI-Beta": "codex-1",
        originator: "Codex Desktop",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return unavailableCoupons(endpoint, [
        `Live reset coupon endpoint returned HTTP ${response.status}.`,
      ]);
    }

    const payload = await response.json();
    return parseResetCouponsPayload(payload, endpoint, options.now ?? new Date());
  } catch {
    return unavailableCoupons(endpoint, ["Live reset coupon lookup failed."]);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Builds an unavailable reset-coupon result with safe warnings.
 *
 * @param endpoint - Live endpoint that would have been used.
 * @param warnings - Non-sensitive warnings explaining why data is unavailable.
 * @returns Normalized unavailable reset-coupon result.
 */
export function unavailableCoupons(
  endpoint = LIVE_RESET_COUPONS_ENDPOINT,
  warnings: string[] = []
): CouponResult {
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
 * Checks whether reset-coupon credentials are configured without reading or exposing values.
 *
 * @param options - Environment and auth-file lookup options.
 * @returns Credential configuration status.
 */
export async function getCouponCredentialStatus(
  options: CouponOptions = {}
): Promise<CouponCredentialStatus> {
  return getCodexCredentialStatus(options);
}

/**
 * Parses the live endpoint payload into normalized reset-coupon data.
 *
 * @param payload - Unknown JSON payload returned by the endpoint.
 * @param endpoint - Endpoint used for the request.
 * @param now - Current time used to compute remaining durations.
 * @returns Normalized reset-coupon result.
 */
function parseResetCouponsPayload(payload: unknown, endpoint: string, now: Date): CouponResult {
  if (!isRecord(payload)) {
    return unavailableCoupons(endpoint, [
      "Live reset coupon endpoint returned an unexpected payload.",
    ]);
  }

  const rawCredits = readArray(payload, ["credits", "reset_credits", "items"]);
  const items = rawCredits
    .map((credit, index) => parseCouponItem(credit, index + 1, now))
    .filter((credit): credit is CouponItem => credit !== null)
    .sort(compareCouponsByExpiry)
    .map((credit, index) => ({...credit, index: index + 1}));
  const nextExpiring = items.find((item) => item.status === "available") ?? items[0] ?? null;

  return {
    status: "available",
    available: readNumber(payload, ["available_count", "availableCount", "available"]),
    earnedThisPeriod: readNumber(payload, [
      "total_earned_count",
      "earned_this_period",
      "earnedThisPeriod",
      "totalEarnedCount",
    ]),
    nextExpirationDate: nextExpiring?.expirationDate ?? null,
    nextExpirationIn: nextExpiring?.expiresIn ?? null,
    items,
    warnings: [],
    source: {
      live: true,
      label: "live Codex reset-credit endpoint",
      endpoint,
    },
  };
}

/**
 * Parses one reset-credit coupon from an unknown JSON object.
 *
 * @param value - Unknown coupon value from the endpoint.
 * @param index - 1-based fallback index before sorting.
 * @param now - Current time used to compute remaining duration.
 * @returns Normalized coupon or null when the value is not an object.
 */
function parseCouponItem(value: unknown, index: number, now: Date): CouponItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const expiresAt = readString(value, "expires_at") ?? readString(value, "expiresAt");
  const grantedAt = readString(value, "granted_at") ?? readString(value, "grantedAt");
  const expiresAtDate = parseDateValue(expiresAt);

  return {
    index,
    status: readString(value, "status"),
    grantedAt,
    expiresAt,
    expirationDate: expiresAtDate ? formatLongDate(expiresAtDate) : null,
    expiresIn: expiresAtDate ? formatDuration(expiresAtDate.getTime() - now.getTime()) : null,
  };
}

/**
 * Sorts coupons by expiration timestamp, pushing missing dates last.
 *
 * @param left - Left coupon.
 * @param right - Right coupon.
 * @returns Sort comparison value.
 */
function compareCouponsByExpiry(left: CouponItem, right: CouponItem): number {
  return dateSortValue(left.expiresAt) - dateSortValue(right.expiresAt);
}

/**
 * Converts an ISO-like date string into a sortable timestamp.
 *
 * @param value - Date string or null.
 * @returns Timestamp in milliseconds, or positive infinity for missing dates.
 */
function dateSortValue(value: string | null): number {
  const date = parseDateValue(value);
  return date ? date.getTime() : Number.POSITIVE_INFINITY;
}

/**
 * Reads the first array value under a set of candidate keys.
 *
 * @param value - Record to inspect.
 * @param keys - Candidate array keys.
 * @returns Array value or an empty array.
 */
function readArray(value: Record<string, unknown>, keys: readonly string[]): unknown[] {
  for (const key of keys) {
    const field = value[key];
    if (Array.isArray(field)) {
      return field;
    }
  }

  return [];
}

/**
 * Reads the first finite number under a set of candidate keys.
 *
 * @param value - Record to inspect.
 * @param keys - Candidate number keys.
 * @returns Finite number or null.
 */
function readNumber(value: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const field = value[key];
    if (typeof field === "number" && Number.isFinite(field)) {
      return field;
    }
  }

  return null;
}

/**
 * Reads a string property from a record.
 *
 * @param value - Record to inspect.
 * @param key - Property name to read.
 * @returns Non-empty string value or null.
 */
function readString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : null;
}

/**
 * Checks whether a value is a non-array object.
 *
 * @param value - Unknown value to inspect.
 * @returns True when the value is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
