import {randomUUID} from "node:crypto";
import {
  getCodexCredentialStatus,
  resolveCodexCredentialResult,
  type CodexCredentials,
} from "@/package/core/auth/codex-auth";
import {isValidCouponId} from "@/package/core/coupons/coupon-id";
import {diagnosticsToWarnings} from "@/package/core/diagnostics";
import {
  authenticatedJsonGet,
  authenticatedJsonRequest,
  sanitizeEndpoint,
} from "@/package/core/network/authenticated-json-get";
import {diagnosticForJsonFailure} from "@/package/core/network/transport-diagnostics";
import type {
  AuthenticatedJsonRequest,
  CouponCredentialStatus,
  CouponOptions,
  CouponResult,
  JsonGetFailure,
  ResetCouponOptions,
  ResetCouponResult,
} from "@/package/core/types";
import {
  mapResetCouponsPayload,
  unavailableCoupons as createUnavailableCoupons,
} from "@/package/core/coupons/payload";
import {isRecord, readString} from "@/package/core/utils/unknown";

export const LIVE_RESET_COUPONS_ENDPOINT =
  "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
export const LIVE_RESET_COUPONS_CONSUME_ENDPOINT = `${LIVE_RESET_COUPONS_ENDPOINT}/consume`;

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_COUPON_RESPONSE_BYTES = 1_000_000;

/** Fetches and normalizes live reset-credit data when complete credentials are available. */
export async function getResetCoupons(options: CouponOptions = {}): Promise<CouponResult> {
  const endpoint = options.endpoint ?? LIVE_RESET_COUPONS_ENDPOINT;
  const publicEndpoint = sanitizeEndpoint(endpoint);
  const credentialResult = await resolveCodexCredentialResult(options);

  if (!credentialResult.credentials) {
    const warnings = diagnosticsToWarnings(credentialResult.diagnostics);
    return unavailableCoupons(
      publicEndpoint,
      warnings.length > 0
        ? warnings
        : [
            "Live reset coupons require a readable Codex auth.json file or CODEX_LIMITS_ACCESS_TOKEN and CODEX_LIMITS_ACCOUNT_ID.",
          ]
    );
  }

  const request: AuthenticatedJsonRequest = createCouponRequest(
    endpoint,
    credentialResult.credentials,
    options
  );

  try {
    const response = await (options.transport ?? authenticatedJsonGet)(request);
    return response.ok
      ? mapResetCouponsPayload(response.payload, publicEndpoint, options.now ?? new Date())
      : unavailableFromFailure(publicEndpoint, response);
  } catch {
    return unavailableFromFailure(publicEndpoint, {
      ok: false,
      code: "network-error",
      status: null,
    });
  }
}

/** Consumes one exact reset coupon through the authenticated idempotent endpoint. */
export async function consumeResetCoupon(
  couponId: string,
  options: ResetCouponOptions = {}
): Promise<ResetCouponResult> {
  if (!isValidCouponId(couponId)) {
    return unconfirmedReset();
  }

  const redeemRequestId = options.redeemRequestId ?? randomUUID();
  if (!isValidRedeemRequestId(redeemRequestId)) {
    return unconfirmedReset();
  }

  const credentialResult = await resolveCodexCredentialResult(options);
  if (!credentialResult.credentials) {
    return unconfirmedReset();
  }

  const endpoint = options.endpoint
    ? toConsumeEndpoint(options.endpoint)
    : LIVE_RESET_COUPONS_CONSUME_ENDPOINT;
  const body = JSON.stringify({
    credit_id: couponId,
    redeem_request_id: redeemRequestId,
  });
  const request: AuthenticatedJsonRequest = {
    ...createCouponRequest(endpoint, credentialResult.credentials, options),
    method: "POST",
    body,
    headers: {
      ...createCouponHeaders(credentialResult.credentials),
      "Content-Type": "application/json",
    },
  };

  try {
    const response = await (options.transport ?? authenticatedJsonRequest)(request);
    return response.ok ? mapConsumeResponse(response.payload) : unconfirmedReset();
  } catch {
    return unconfirmedReset();
  }
}

/** Builds a sanitized unavailable result for callers that do not perform a lookup. */
export function unavailableCoupons(
  endpoint = LIVE_RESET_COUPONS_ENDPOINT,
  warnings: string[] = []
): CouponResult {
  return createUnavailableCoupons(sanitizeEndpoint(endpoint), warnings);
}

export async function getCouponCredentialStatus(
  options: CouponOptions = {}
): Promise<CouponCredentialStatus> {
  return getCodexCredentialStatus(options);
}

function unavailableFromFailure(endpoint: string, failure: JsonGetFailure): CouponResult {
  return createUnavailableCoupons(
    endpoint,
    diagnosticsToWarnings([diagnosticForJsonFailure(failure, "Live reset coupon")])
  );
}

function createCouponRequest(
  endpoint: string,
  credentials: CodexCredentials,
  options: CouponOptions
): AuthenticatedJsonRequest {
  return {
    endpoint,
    headers: createCouponHeaders(credentials),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxResponseBytes: MAX_COUPON_RESPONSE_BYTES,
    ...(options.fetch ? {fetch: options.fetch} : {}),
    ...(options.signal ? {signal: options.signal} : {}),
  };
}

function createCouponHeaders(credentials: CodexCredentials): Record<string, string> {
  return {
    Authorization: `Bearer ${credentials.accessToken}`,
    "ChatGPT-Account-ID": credentials.accountId,
    "OpenAI-Beta": "codex-1",
    originator: "Codex Desktop",
    Accept: "application/json",
  };
}

function mapConsumeResponse(payload: unknown): ResetCouponResult {
  if (!isRecord(payload)) {
    return unconfirmedReset();
  }

  const windowsResetValue = payload.windows_reset;
  const windowsReset =
    typeof windowsResetValue === "number" &&
    Number.isSafeInteger(windowsResetValue) &&
    windowsResetValue >= 0
      ? windowsResetValue
      : null;

  switch (readString(payload, "code")) {
    case "reset":
      return {outcome: "reset", windowsReset};
    case "already_redeemed":
      return {outcome: "already-redeemed", windowsReset};
    case "nothing_to_reset":
      return {outcome: "nothing-to-reset", windowsReset};
    case "no_credit":
      return {outcome: "no-credit", windowsReset};
    default:
      return unconfirmedReset();
  }
}

function toConsumeEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/consume`;
    url.hash = "";
    return url.href;
  } catch {
    return endpoint;
  }
}

function isValidRedeemRequestId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function unconfirmedReset(): ResetCouponResult {
  return {outcome: "unconfirmed", windowsReset: null};
}
