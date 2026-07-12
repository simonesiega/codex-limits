import {getCodexCredentialStatus, resolveCodexCredentialResult} from "../auth/codex-auth";
import {diagnosticsToWarnings} from "../diagnostics";
import {authenticatedJsonGet, sanitizeEndpoint} from "../network/authenticated-json-get";
import {diagnosticForJsonFailure} from "../network/transport-diagnostics";
import type {
  AuthenticatedJsonRequest,
  CouponCredentialStatus,
  CouponOptions,
  CouponResult,
  JsonGetFailure,
} from "../types";
import {mapResetCouponsPayload, unavailableCoupons as createUnavailableCoupons} from "./payload";

// The explicit live Codex endpoint for fetching reset-credit coupons.
export const LIVE_RESET_COUPONS_ENDPOINT =
  "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_COUPON_RESPONSE_BYTES = 1_000_000;

/**
 * Gets reset-coupon information from the live Codex endpoint, if available.
 * @param options - Options for fetching reset-coupon information, including endpoint, timeout, and fetch implementation.
 * @returns - A promise resolving to the reset-coupon information.
 */
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
    if (!response.ok) {
      return unavailableFromFailure(publicEndpoint, response);
    }
    return mapResetCouponsPayload(response.payload, publicEndpoint, options.now ?? new Date());
  } catch {
    return unavailableFromFailure(publicEndpoint, {
      ok: false,
      code: "network-error",
      status: null,
    });
  }
}

/**
 * Builds an unavailable reset-coupon result with safe warnings.
 * @param endpoint - The endpoint for which coupons are unavailable.
 * @param warnings - A list of warnings to include in the result.
 * @returns - The unavailable coupon result.
 */
export function unavailableCoupons(
  endpoint = LIVE_RESET_COUPONS_ENDPOINT,
  warnings: string[] = []
): CouponResult {
  return createUnavailableCoupons(sanitizeEndpoint(endpoint), warnings);
}

/**
 * Gets the status of the Codex credentials used for fetching reset-coupon information.
 * @param options - Options for fetching reset-coupon information, including endpoint, timeout, and fetch implementation.
 * @returns - A promise resolving to the credential status.
 */
export async function getCouponCredentialStatus(
  options: CouponOptions = {}
): Promise<CouponCredentialStatus> {
  return getCodexCredentialStatus(options);
}

/**
 * Builds an unavailable reset-coupon result from a JSON GET failure.
 * @param endpoint - The endpoint for which coupons are unavailable.
 * @param failure - The failure object containing details about the JSON GET error.
 * @returns - The unavailable coupon result.
 */
function unavailableFromFailure(endpoint: string, failure: JsonGetFailure): CouponResult {
  return createUnavailableCoupons(
    endpoint,
    diagnosticsToWarnings([diagnosticForJsonFailure(failure, "Live reset coupon")])
  );
}
