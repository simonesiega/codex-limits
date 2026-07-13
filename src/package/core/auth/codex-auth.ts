import {join, normalize} from "node:path";
import {detectCodexHome} from "@/package/core/codex/paths";
import {warningDiagnostic, type Diagnostic} from "@/package/core/diagnostics";
import type {CodexAuthOptions, CouponCredentialStatus} from "@/package/core/types";
import {BoundedFileError, readBoundedUtf8File} from "@/package/core/utils/bounded-file";
import {readEnvValue, resolveEnvironment} from "@/package/core/utils/env";
import {isRecord, readString} from "@/package/core/utils/unknown";

const MAX_AUTH_FILE_BYTES = 1_000_000;

/** Credentials kept inside the authenticated transport boundary. */
export interface CodexCredentials {
  accessToken: string;
  accountId: string;
}

/** Safe credential discovery result without paths or credential values in diagnostics. */
export interface CodexCredentialResolution {
  credentials: CodexCredentials | null;
  status: "configured" | "malformed" | "missing" | "partial" | "unreadable";
  diagnostics: Diagnostic[];
}

/** Resolves complete environment credentials or a bounded local auth file. */
export async function resolveCodexCredentialResult(
  options: CodexAuthOptions = {}
): Promise<CodexCredentialResolution> {
  const env = resolveEnvironment(options.env);
  const accessToken = readEnvValue(env, "CODEX_LIMITS_ACCESS_TOKEN");
  const accountId = readEnvValue(env, "CODEX_LIMITS_ACCOUNT_ID");

  if (accessToken && accountId) {
    return {credentials: {accessToken, accountId}, status: "configured", diagnostics: []};
  }
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
  return authFile
    ? readAuthFile(authFile)
    : {credentials: null, status: "missing", diagnostics: []};
}

export async function resolveCodexCredentials(
  options: CodexAuthOptions = {}
): Promise<CodexCredentials | null> {
  return (await resolveCodexCredentialResult(options)).credentials;
}

export async function getCodexCredentialStatus(
  options: CodexAuthOptions = {}
): Promise<CouponCredentialStatus> {
  const {status} = await resolveCodexCredentialResult(options);
  return status === "configured" ? "configured" : status === "partial" ? "partial" : "missing";
}

async function resolveCodexAuthFile(options: CodexAuthOptions): Promise<string | null> {
  if (options.authFile) {
    return normalize(options.authFile);
  }
  const detection = await detectCodexHome(options);
  return detection.foundHome ? join(detection.foundHome, "auth.json") : null;
}

async function readAuthFile(authPath: string): Promise<CodexCredentialResolution> {
  let content: string;
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

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) {
      return malformedAuthResult();
    }

    const tokens = isRecord(parsed.tokens) ? parsed.tokens : parsed;
    const accessToken = readString(tokens, "access_token");
    const accountId = readString(tokens, "account_id");
    return accessToken && accountId
      ? {credentials: {accessToken, accountId}, status: "configured", diagnostics: []}
      : malformedAuthResult();
  } catch {
    return malformedAuthResult();
  }
}

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
