import {
  getCodexCredentialStatus,
  resolveCodexCredentialResult,
} from "@/package/core/auth/codex-auth";
import {diagnosticsToWarnings} from "@/package/core/diagnostics";
import {
  authenticatedJsonGet,
  sanitizeEndpoint,
} from "@/package/core/network/authenticated-json-get";
import {diagnosticForJsonFailure} from "@/package/core/network/transport-diagnostics";
import type {
  AuthenticatedJsonRequest,
  CouponCredentialStatus,
  CouponOptions,
  CouponResult,
  JsonGetFailure,
} from "@/package/core/types";
import {
  mapResetCouponsPayload,
  unavailableCoupons as createUnavailableCoupons,
} from "@/package/core/coupons/payload";

export const LIVE_RESET_COUPONS_ENDPOINT =
  "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";

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

  const request: AuthenticatedJsonRequest = {
    endpoint,
    headers: {
      Authorization: `Bearer ${credentialResult.credentials.accessToken}`,
      "ChatGPT-Account-ID": credentialResult.credentials.accountId,
      "OpenAI-Beta": "codex-1",
      originator: "Codex Desktop",
      Accept: "application/json",
    },
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxResponseBytes: MAX_COUPON_RESPONSE_BYTES,
    ...(options.fetch ? {fetch: options.fetch} : {}),
    ...(options.signal ? {signal: options.signal} : {}),
  };

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
