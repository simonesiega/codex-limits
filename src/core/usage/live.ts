import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { resolveCodexCredentials } from "../auth/codex-auth";
import type { CodexLimitsOptions, FetchLike, FetchResponseLike, UsageResult } from "../types";
import { readEnvValue, resolveEnvironment } from "../utils/env";
import { buildUsageResult, parseUsageWindowsFromRateLimits } from "./normalizer";

export const LIVE_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/codex/usage";

const DEFAULT_TIMEOUT_MS = 10_000;
const UNAVAILABLE_SOURCE = { kind: "unavailable", label: "Unavailable" } as const;

/**
 * Fetches current usage-limit windows from the ChatGPT/Codex backend.
 *
 * @param options - Environment, auth, fetch, endpoint, timeout, and clock overrides.
 * @returns Normalized usage result that never includes tokens.
 */
export async function getLiveUsage(options: CodexLimitsOptions = {}): Promise<UsageResult> {
  const endpoint = resolveUsageEndpoint(options);
  const credentials = await resolveCodexCredentials(options);

  if (!credentials) {
    return unavailableLiveUsage(["Live usage requires Codex authentication."]);
  }

  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (!fetchImplementation) {
    return unavailableLiveUsage(["This runtime does not provide fetch for live usage lookup."]);
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = buildUsageHeaders(credentials);

  try {
    const response = await (fetchImplementation as FetchLike)(endpoint, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    return await parseLiveUsageResponse(response, endpoint, timeoutMs, headers, options.now ?? new Date());
  } catch {
    return await getLiveUsageWithNativeRequest(endpoint, timeoutMs, headers, options.now ?? new Date(), "Live usage lookup failed.");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Builds authenticated headers for the Codex live usage endpoint.
 *
 * @param credentials - Resolved Codex credentials.
 * @returns Headers that do not get logged or exposed.
 */
function buildUsageHeaders(credentials: { accessToken: string; accountId: string }): Record<string, string> {
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
 * Parses a fetch response, retrying with Node's native request stack when needed.
 *
 * @param response - Fetch response.
 * @param endpoint - Endpoint URL.
 * @param timeoutMs - Request timeout in milliseconds.
 * @param headers - Authenticated request headers.
 * @param now - Current time used to compute reset durations.
 * @returns Normalized usage result.
 */
async function parseLiveUsageResponse(response: FetchResponseLike, endpoint: string, timeoutMs: number, headers: Record<string, string>, now: Date): Promise<UsageResult> {
  if (response.ok) {
    return parseLiveUsagePayload(await response.json(), endpoint, now);
  }

  return getLiveUsageWithNativeRequest(endpoint, timeoutMs, headers, now, `Live usage endpoint returned HTTP ${response.status}.`);
}

/**
 * Retries the live usage endpoint without Node's native fetch implementation.
 *
 * @param endpoint - Endpoint URL.
 * @param timeoutMs - Request timeout in milliseconds.
 * @param headers - Authenticated request headers.
 * @param now - Current time used to compute reset durations.
 * @param fallbackWarning - Warning to use if the retry also fails.
 * @returns Normalized usage result.
 */
async function getLiveUsageWithNativeRequest(endpoint: string, timeoutMs: number, headers: Record<string, string>, now: Date, fallbackWarning: string): Promise<UsageResult> {
  try {
    const response = await requestJson(endpoint, headers, timeoutMs);
    if (!response.ok) {
      return unavailableLiveUsage([`Live usage endpoint returned HTTP ${response.status}.`]);
    }

    return parseLiveUsagePayload(await response.json(), endpoint, now);
  } catch {
    return unavailableLiveUsage([fallbackWarning]);
  }
}

/**
 * Resolves the live usage endpoint from options, environment, or default.
 *
 * @param options - CLI/core options.
 * @returns Endpoint URL.
 */
function resolveUsageEndpoint(options: CodexLimitsOptions): string {
  const env = resolveEnvironment(options.env);
  return options.usageEndpoint ?? readEnvValue(env, "CODEX_LIMITS_USAGE_ENDPOINT") ?? LIVE_USAGE_ENDPOINT;
}

/**
 * Parses a live usage payload into normalized windows.
 *
 * @param payload - Unknown endpoint JSON payload.
 * @param endpoint - Endpoint used to fetch the payload.
 * @param now - Current time used to compute reset durations.
 * @returns Normalized API usage result.
 */
function parseLiveUsagePayload(payload: unknown, endpoint: string, now: Date): UsageResult {
  const rateLimits = findRateLimits(payload) ?? buildRateLimitsFromWindowArray(payload);
  if (!rateLimits) {
    return unavailableLiveUsage(["Live usage endpoint returned an unexpected payload."]);
  }

  return buildUsageResult(parseUsageWindowsFromRateLimits(rateLimits, now), { kind: "api", label: "API", endpoint });
}

/**
 * Creates an unavailable live usage result.
 *
 * @param warnings - Non-sensitive warnings.
 * @returns Unavailable usage result.
 */
function unavailableLiveUsage(warnings: string[]): UsageResult {
  return buildUsageResult({ fiveHour: null, weekly: null }, UNAVAILABLE_SOURCE, warnings);
}

/**
 * Finds a Codex rate_limits object in a response payload.
 *
 * @param value - Unknown payload value.
 * @param depth - Current recursion depth.
 * @returns Rate limits record or null.
 */
function findRateLimits(value: unknown, depth = 0): Record<string, unknown> | null {
  if (!isRecord(value) || depth > 5) {
    return null;
  }

  const direct = value.rate_limits ?? value.rateLimits ?? value.rate_limit ?? value.rateLimit;
  if (isRecord(direct)) {
    return direct;
  }

  if (isRecord(value.primary) || isRecord(value.secondary) || isRecord(value.primary_window) || isRecord(value.secondary_window)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    const found = findRateLimits(nested, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Builds primary/secondary windows from array-shaped analytics payloads.
 *
 * @param value - Unknown payload value.
 * @param depth - Current recursion depth.
 * @returns Rate limits record or null.
 */
function buildRateLimitsFromWindowArray(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 5) {
    return null;
  }

  if (Array.isArray(value)) {
    const primary = value.find((item) => isUsageWindowRecord(item, "primary"));
    const secondary = value.find((item) => isUsageWindowRecord(item, "secondary"));
    return primary || secondary ? { primary, secondary } : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const nested of Object.values(value)) {
    const found = buildRateLimitsFromWindowArray(nested, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Identifies an array item as a primary or secondary usage window.
 *
 * @param value - Unknown array item.
 * @param kind - Window kind to match.
 * @returns True when the item matches the requested window.
 */
function isUsageWindowRecord(value: unknown, kind: "primary" | "secondary"): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const label = String(value.type ?? value.kind ?? value.name ?? value.label ?? value.window ?? "").toLowerCase();
  if (kind === "primary" && (label.includes("primary") || label.includes("5-hour") || label.includes("five"))) {
    return true;
  }

  if (kind === "secondary" && (label.includes("secondary") || label.includes("weekly") || label.includes("week"))) {
    return true;
  }

  const minutes = value.window_minutes ?? value.windowMinutes ?? value.window_length_minutes ?? value.windowLengthMinutes;
  return kind === "primary" ? minutes === 300 : minutes === 10_080;
}

/**
 * Performs a JSON GET request using Node's http/https modules.
 *
 * @param endpoint - Endpoint URL.
 * @param headers - Request headers.
 * @param timeoutMs - Request timeout in milliseconds.
 * @returns Minimal fetch-like response.
 */
function requestJson(endpoint: string, headers: Record<string, string>, timeoutMs: number): Promise<FetchResponseLike> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const request = (url.protocol === "http:" ? httpRequest : httpsRequest)(
      url,
      {
        method: "GET",
        headers,
        timeout: timeoutMs,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            ok: response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode ?? 0,
            json: async () => JSON.parse(body) as unknown,
          });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Live usage request timed out."));
    });

    request.on("error", reject);
    request.end();
  });
}

/**
 * Checks whether a value is a non-array object.
 *
 * @param value - Unknown value.
 * @returns True when value is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
