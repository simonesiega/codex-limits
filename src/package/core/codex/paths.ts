import {stat} from "node:fs/promises";
import {homedir} from "node:os";
import {join, normalize} from "node:path";
import {readEnvValue, resolveEnvironment} from "../utils/env";
import type {
  CodexHomeCandidate,
  CodexHomeCandidatePath,
  CodexHomeDetection,
  CodexHomeOptions,
} from "../types";

const CODEX_LIMITS_HOME = "CODEX_LIMITS_HOME";

/**
 * Returns candidate Codex home paths without touching the filesystem.
 *
 * @param options - Optional filesystem and environment overrides.
 * @returns Ordered candidate paths, with CODEX_LIMITS_HOME first when set.
 */
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
  const overrideHome = readEnvValue(env, CODEX_LIMITS_HOME);
  const codexHome = readEnvValue(env, "CODEX_HOME");

  appendCandidate(paths, overrideHome, "env");
  appendCandidate(paths, codexHome, "env");

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

/**
 * Finds the first readable local Codex home directory, if one exists.
 *
 * @param options - Optional filesystem and environment overrides.
 * @returns Detection details including candidates checked and the first readable directory.
 */
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

/**
 * Adds a normalized candidate path when a value is present.
 *
 * @param paths - Mutable candidate list being built.
 * @param path - Candidate path to append.
 * @param source - Whether the path came from the environment or defaults.
 * @returns Nothing; the candidate list is updated in place.
 */
function appendCandidate(
  paths: CodexHomeCandidatePath[],
  path: string | null,
  source: CodexHomeCandidatePath["source"]
): void {
  if (!path) {
    return;
  }

  paths.push({path: normalize(path), source});
}

/**
 * Checks whether a path is a readable directory.
 *
 * @param path - Candidate directory path.
 * @returns True when the path exists and is a directory, otherwise false.
 */
async function canReadDirectory(path: string): Promise<boolean> {
  try {
    const details = await stat(path);
    return details.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Removes duplicate candidate paths while preserving the first occurrence.
 *
 * @param paths - Candidate paths that may contain duplicates.
 * @returns Deduplicated candidate paths.
 */
function dedupePaths(paths: CodexHomeCandidatePath[]): CodexHomeCandidatePath[] {
  const seen = new Set<string>();
  const result: CodexHomeCandidatePath[] = [];

  for (const candidate of paths) {
    const normalizedPath = normalize(candidate.path);
    const key = normalizedPath.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({path: normalizedPath, source: candidate.source});
  }

  return result;
}
