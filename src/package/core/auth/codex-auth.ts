import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { detectCodexHome } from "../codex/paths";
import type { CodexAuthOptions, CouponCredentialStatus } from "../types";
import { readEnvValue, resolveEnvironment } from "../utils/env";

/** Codex account credentials used for authenticated ChatGPT backend calls. */
export interface CodexCredentials {
  /** ChatGPT access token. */
  accessToken: string;
  /** ChatGPT account id. */
  accountId: string;
}

/**
 * Resolves Codex credentials from environment variables or a local auth.json file.
 *
 * @param options - Environment, filesystem, and auth-file lookup options.
 * @returns Access token and account id, or null when unavailable.
 */
export async function resolveCodexCredentials(options: CodexAuthOptions): Promise<CodexCredentials | null> {
  const env = resolveEnvironment(options.env);
  const accessToken = readEnvValue(env, "CODEX_LIMITS_ACCESS_TOKEN");
  const accountId = readEnvValue(env, "CODEX_LIMITS_ACCOUNT_ID");

  if (accessToken || accountId) {
    return accessToken && accountId ? { accessToken, accountId } : null;
  }

  const authFile = await resolveCodexAuthFile(options);
  return authFile ? readAuthFile(authFile) : null;
}

/**
 * Checks whether Codex credentials are configured without exposing values.
 *
 * @param options - Environment and auth-file lookup options.
 * @returns Credential configuration status.
 */
export async function getCodexCredentialStatus(options: CodexAuthOptions = {}): Promise<CouponCredentialStatus> {
  const env = resolveEnvironment(options.env);
  const accessToken = readEnvValue(env, "CODEX_LIMITS_ACCESS_TOKEN");
  const accountId = readEnvValue(env, "CODEX_LIMITS_ACCOUNT_ID");

  if (accessToken && accountId) {
    return "configured";
  }

  if (accessToken || accountId) {
    return "partial";
  }

  const authFile = await resolveCodexAuthFile(options);
  return authFile && (await readAuthFile(authFile)) ? "configured" : "missing";
}

/**
 * Resolves the Codex auth.json path for live lookups.
 *
 * @param options - Environment and filesystem lookup options.
 * @returns Normalized auth file path or null.
 */
async function resolveCodexAuthFile(options: CodexAuthOptions): Promise<string | null> {
  if (options.authFile) {
    return normalize(options.authFile);
  }

  const detection = await detectCodexHome(options);
  return detection.foundHome ? join(detection.foundHome, "auth.json") : null;
}

/**
 * Reads account credentials from a Codex auth.json file without exposing them.
 *
 * @param authPath - Auth JSON file path.
 * @returns Access token and account id, or null when missing or invalid.
 */
async function readAuthFile(authPath: string): Promise<CodexCredentials | null> {
  try {
    const parsed = JSON.parse(await readFile(authPath, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const tokens = isRecord(parsed.tokens) ? parsed.tokens : parsed;
    const accessToken = readString(tokens, "access_token");
    const accountId = readString(tokens, "account_id");

    return accessToken && accountId ? { accessToken, accountId } : null;
  } catch {
    return null;
  }
}

/**
 * Reads a string property from a record.
 *
 * @param value - Record to inspect.
 * @param key - Property name.
 * @returns Non-empty string or null.
 */
function readString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : null;
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
