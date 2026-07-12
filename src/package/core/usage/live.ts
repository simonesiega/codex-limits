import {resolveCodexCredentialResult} from "../auth/codex-auth";
import {diagnosticsToWarnings} from "../diagnostics";
import {authenticatedJsonGet, sanitizeEndpoint} from "../network/authenticated-json-get";
import {diagnosticForJsonFailure} from "../network/transport-diagnostics";
import type {
  AuthenticatedJsonRequest,
  CodexLimitsOptions,
  JsonGetFailure,
  UsageResult,
} from "../types";
import {readEnvValue, resolveEnvironment} from "../utils/env";
import {mapLiveUsagePayload, unavailableLiveUsage} from "./live-payload";

export const LIVE_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/codex/usage";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_USAGE_RESPONSE_BYTES = 1_000_000;

/**
 * Fetches current usage-limit windows from the ChatGPT/Codex backend.
 * @param options - The options for the request.
 * @returns - A promise resolving to the usage result.
 */
export async function getLiveUsage(options: CodexLimitsOptions = {}): Promise<UsageResult> {
  const endpoint = resolveUsageEndpoint(options);
  const publicEndpoint = sanitizeEndpoint(endpoint);
  const credentialResult = await resolveCodexCredentialResult(options);

  // If credentials are not available, return an unavailable usage result with appropriate warnings.
  if (!credentialResult.credentials) {
    const warnings = diagnosticsToWarnings(credentialResult.diagnostics);
    return unavailableLiveUsage(
      warnings.length > 0 ? warnings : ["Live usage requires Codex authentication."]
    );
  }

  const request: AuthenticatedJsonRequest = {
    endpoint,
    headers: buildUsageHeaders(credentialResult.credentials),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxResponseBytes: MAX_USAGE_RESPONSE_BYTES,
    fallbackOnHttpError: true,
    ...(options.fetch ? {fetch: options.fetch} : {}),
    ...(options.signal ? {signal: options.signal} : {}),
  };

  // Attempt to fetch the live usage data and handle any potential errors.
  try {
    const response = await (options.transport ?? authenticatedJsonGet)(request);
    if (!response.ok) {
      return unavailableFromFailure(response);
    }
    return mapLiveUsagePayload(response.payload, publicEndpoint, options.now ?? new Date());
  } catch {
    return unavailableFromFailure({ok: false, code: "network-error", status: null});
  }
}

/**
 * Builds the headers for the usage request.
 * @param credentials - The credentials containing the access token and account ID.
 * @returns - An object representing the headers for the request.
 */
function buildUsageHeaders(credentials: {
  accessToken: string;
  accountId: string;
}): Record<string, string> {
  return {
    Authorization: `Bearer ${credentials.accessToken}`,
    "ChatGPT-Account-ID": credentials.accountId,
    "OpenAI-Beta": "codex-1",
    originator: "Codex Desktop",
    Accept: "application/json",
    "User-Agent": "Codex Desktop",
    Referer: "https://chatgpt.com/codex/cloud/settings/analytics",
    Origin: "https://chatgpt.com",
  };
}

/**
 * Resolves the usage endpoint based on the provided options.
 * @param options - The options for the request.
 * @returns - The resolved usage endpoint.
 */
function resolveUsageEndpoint(options: CodexLimitsOptions): string {
  const env = resolveEnvironment(options.env);
  return (
    options.usageEndpoint ?? readEnvValue(env, "CODEX_LIMITS_USAGE_ENDPOINT") ?? LIVE_USAGE_ENDPOINT
  );
}

/**
 * Creates an unavailable usage result from a failed request.
 * @param failure - The failure object representing the error.
 * @returns - A UsageResult object representing the unavailable usage data.
 */
function unavailableFromFailure(failure: JsonGetFailure): UsageResult {
  return unavailableLiveUsage(
    diagnosticsToWarnings([diagnosticForJsonFailure(failure, "Live usage")])
  );
}
