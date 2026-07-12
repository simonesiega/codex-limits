import {join, normalize} from "node:path";
import {detectCodexHome} from "../codex/paths";
import {warningDiagnostic, type Diagnostic} from "../diagnostics";
import type {CodexAuthOptions, CouponCredentialStatus} from "../types";
import {BoundedFileError, readBoundedUtf8File} from "../utils/bounded-file";
import {readEnvValue, resolveEnvironment} from "../utils/env";
import {isRecord, readString} from "../utils/unknown";

const MAX_AUTH_FILE_BYTES = 1_000_000;

/**
 * Store the resolved Codex credentials for authentication with the Codex API.
 */
export interface CodexCredentials {
  // Codex access token.
  accessToken: string;

  // Codex account id.
  accountId: string;
}

/**
 * Store the result of resolving Codex credentials.
 */
export interface CodexCredentialResolution {
  credentials: CodexCredentials | null;

  // The status of the credentials resolution.
  status: "configured" | "malformed" | "missing" | "partial" | "unreadable";

  diagnostics: Diagnostic[];
}

/**
 * Resolves the Codex credentials and returns a structured result with diagnostics.
 * @param options - Options for resolving Codex credentials, including environment variables and auth file path.
 * @returns - A promise that resolves to a `CodexCredentialResolution` object.
 */
export async function resolveCodexCredentialResult(
  options: CodexAuthOptions = {}
): Promise<CodexCredentialResolution> {
  const env = resolveEnvironment(options.env);
  const accessToken = readEnvValue(env, "CODEX_LIMITS_ACCESS_TOKEN");
  const accountId = readEnvValue(env, "CODEX_LIMITS_ACCOUNT_ID");

  if (accessToken && accountId) {
    return {credentials: {accessToken, accountId}, status: "configured", diagnostics: []};
  }

  // If either the access token or account ID is present but not both.
  if (accessToken || accountId) {
    return {
      credentials: null,
      status: "partial",
      diagnostics: [
        warningDiagnostic(
          "auth.environment.partial",
          "authentication",
          "Codex authentication environment variables are incomplete."
        ),
      ],
    };
  }

  const authFile = await resolveCodexAuthFile(options);
  if (!authFile) {
    return {credentials: null, status: "missing", diagnostics: []};
  }

  return readAuthFile(authFile);
}

/**
 * Resolves the Codex credentials.
 * @param options - Options for resolving Codex credentials, including environment variables and auth file path.
 * @returns - A promise that resolves to the Codex credentials or null if they are not available.
 */
export async function resolveCodexCredentials(
  options: CodexAuthOptions = {}
): Promise<CodexCredentials | null> {
  return (await resolveCodexCredentialResult(options)).credentials;
}

/**
 * Gets the status of the Codex credentials.
 * @param options - Options for resolving Codex credentials, including environment variables and auth file path.
 * @returns - A promise that resolves to the status of the credentials.
 */
export async function getCodexCredentialStatus(
  options: CodexAuthOptions = {}
): Promise<CouponCredentialStatus> {
  const result = await resolveCodexCredentialResult(options);
  if (result.status === "configured") {
    return "configured";
  }
  return result.status === "partial" ? "partial" : "missing";
}

/**
 * Resolves the path to the Codex authentication file.
 * @param options - Options for resolving the authentication file path.
 * @returns - A promise that resolves to the path of the authentication file or null if not found.
 */
async function resolveCodexAuthFile(options: CodexAuthOptions): Promise<string | null> {
  if (options.authFile) {
    return normalize(options.authFile);
  }

  const detection = await detectCodexHome(options);
  return detection.foundHome ? join(detection.foundHome, "auth.json") : null;
}

/**
 * Reads and parses the Codex authentication file, returning the credentials and status.
 * @param authPath - The path to the Codex authentication file.
 * @returns - A promise that resolves to a `CodexCredentialResolution` object.
 */
async function readAuthFile(authPath: string): Promise<CodexCredentialResolution> {
  let content: string;

  // Attempt to read the authentication file with a bounded size limit.
  try {
    content = await readBoundedUtf8File(authPath, MAX_AUTH_FILE_BYTES);
  } catch (error) {
    if (error instanceof BoundedFileError && error.code === "not-found") {
      return {credentials: null, status: "missing", diagnostics: []};
    }

    const tooLarge = error instanceof BoundedFileError && error.code === "too-large";
    return {
      credentials: null,
      status: "unreadable",
      diagnostics: [
        warningDiagnostic(
          tooLarge ? "auth.file.too-large" : "auth.file.unreadable",
          "authentication",
          tooLarge
            ? "Codex auth.json is too large to inspect safely."
            : "Codex auth.json could not be read safely."
        ),
      ],
    };
  }

  // Attempt to parse the authentication file content as JSON and extract credentials.
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) {
      return malformedAuthResult();
    }

    const tokens = isRecord(parsed.tokens) ? parsed.tokens : parsed;
    const accessToken = readString(tokens, "access_token");
    const accountId = readString(tokens, "account_id");
    if (!accessToken || !accountId) {
      return malformedAuthResult();
    }

    return {credentials: {accessToken, accountId}, status: "configured", diagnostics: []};
  } catch {
    return malformedAuthResult();
  }
}

/**
 * Returns a `CodexCredentialResolution` object indicating that the authentication file is malformed.
 * @returns - A `CodexCredentialResolution` object with status "malformed" and a diagnostic warning.
 */
function malformedAuthResult(): CodexCredentialResolution {
  return {
    credentials: null,
    status: "malformed",
    diagnostics: [
      warningDiagnostic(
        "auth.file.malformed",
        "authentication",
        "Codex auth.json is malformed or does not contain required credentials."
      ),
    ],
  };
}
