import {constants} from "node:fs";
import {access, stat} from "node:fs/promises";
import {homedir} from "node:os";
import {join, normalize} from "node:path";
import type {
  CodexHomeCandidate,
  CodexHomeCandidatePath,
  CodexHomeDetection,
  CodexHomeOptions,
} from "@/package/core/types";
import {readEnvValue, resolveEnvironment} from "@/package/core/utils/env";

const CODEX_LIMITS_HOME = "CODEX_LIMITS_HOME";

/** Returns ordered Codex home candidates without touching the filesystem. */
export function getCodexHomeCandidatePaths(
  options: CodexHomeOptions = {}
): CodexHomeCandidatePath[] {
  const env = resolveEnvironment(options.env);
  const home =
    options.homeDirectory ??
    readEnvValue(env, "HOME") ??
    readEnvValue(env, "USERPROFILE") ??
    homedir();
  const appData = options.appData ?? readEnvValue(env, "APPDATA");
  const localAppData = options.localAppData ?? readEnvValue(env, "LOCALAPPDATA");
  const paths: CodexHomeCandidatePath[] = [];

  appendCandidate(paths, readEnvValue(env, CODEX_LIMITS_HOME), "env");
  appendCandidate(paths, readEnvValue(env, "CODEX_HOME"), "env");

  if (home) {
    appendCandidate(paths, join(home, ".codex"), "default");
    appendCandidate(paths, join(home, ".config", "codex"), "default");
    appendCandidate(paths, join(home, "Library", "Application Support", "Codex"), "default");
    appendCandidate(
      paths,
      join(home, "Library", "Application Support", "Parall", "Codex", ".codex"),
      "default"
    );
  }

  appendCandidate(paths, appData ? join(appData, "Codex") : null, "default");
  appendCandidate(paths, localAppData ? join(localAppData, "Codex") : null, "default");
  return dedupePaths(paths);
}

/** Finds the first readable Codex home while retaining candidate diagnostics. */
export async function detectCodexHome(options: CodexHomeOptions = {}): Promise<CodexHomeDetection> {
  const env = resolveEnvironment(options.env);
  const overrideHome = readEnvValue(env, CODEX_LIMITS_HOME);
  const candidates = await Promise.all(
    getCodexHomeCandidatePaths(options).map(async (candidate): Promise<CodexHomeCandidate> => ({
      ...candidate,
      exists: await canReadDirectory(candidate.path),
    }))
  );

  return {
    overrideHome: overrideHome ? normalize(overrideHome) : null,
    candidates,
    foundHome: candidates.find((candidate) => candidate.exists)?.path ?? null,
  };
}

function appendCandidate(
  paths: CodexHomeCandidatePath[],
  path: string | null,
  source: CodexHomeCandidatePath["source"]
): void {
  if (path) {
    paths.push({path: normalize(path), source});
  }
}

async function canReadDirectory(path: string): Promise<boolean> {
  try {
    const details = await stat(path);
    if (!details.isDirectory()) {
      return false;
    }

    // Top-level home symlinks are allowed; nested readers independently reject symlink entries.
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function dedupePaths(paths: readonly CodexHomeCandidatePath[]): CodexHomeCandidatePath[] {
  const seen = new Set<string>();
  const result: CodexHomeCandidatePath[] = [];

  for (const candidate of paths) {
    const normalizedPath = normalize(candidate.path);
    const key = process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({path: normalizedPath, source: candidate.source});
    }
  }
  return result;
}
