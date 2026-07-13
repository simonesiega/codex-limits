import {resolveCodexCredentialResult} from "@/package/core/auth/codex-auth";
import {diagnosticsToWarnings} from "@/package/core/diagnostics";
import {
  authenticatedJsonGet,
  sanitizeEndpoint,
} from "@/package/core/network/authenticated-json-get";
import {diagnosticForJsonFailure} from "@/package/core/network/transport-diagnostics";
import type {
  AuthenticatedJsonRequest,
  CodexLimitsOptions,
  JsonGetFailure,
  UsageResult,
} from "@/package/core/types";
import {mapLiveUsagePayload, unavailableLiveUsage} from "@/package/core/usage/live-payload";
import {readEnvValue, resolveEnvironment} from "@/package/core/utils/env";

export const LIVE_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/codex/usage";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_USAGE_RESPONSE_BYTES = 1_000_000;

/** Fetches current usage windows through the shared bounded authenticated transport. */
export async function getLiveUsage(options: CodexLimitsOptions = {}): Promise<UsageResult> {
  const endpoint = resolveUsageEndpoint(options);
  const publicEndpoint = sanitizeEndpoint(endpoint);
  const credentialResult = await resolveCodexCredentialResult(options);

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

  try {
    const response = await (options.transport ?? authenticatedJsonGet)(request);
    return response.ok
      ? mapLiveUsagePayload(response.payload, publicEndpoint, options.now ?? new Date())
      : unavailableFromFailure(response);
  } catch {
    return unavailableFromFailure({ok: false, code: "network-error", status: null});
  }
}

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

function resolveUsageEndpoint(options: CodexLimitsOptions): string {
  const env = resolveEnvironment(options.env);
  return (
    options.usageEndpoint ?? readEnvValue(env, "CODEX_LIMITS_USAGE_ENDPOINT") ?? LIVE_USAGE_ENDPOINT
  );
}

function unavailableFromFailure(failure: JsonGetFailure): UsageResult {
  return unavailableLiveUsage(
    diagnosticsToWarnings([diagnosticForJsonFailure(failure, "Live usage")])
  );
}
