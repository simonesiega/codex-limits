import type {Dirent} from "node:fs";
import {createReadStream} from "node:fs";
import {readdir, stat} from "node:fs/promises";
import {join, relative} from "node:path";
import {createInterface} from "node:readline";
import type {CodexSessionFile, CodexSessionReadResult, CodexSessionSnapshot} from "../types";

const MAX_SESSION_DEPTH = 8;
const MAX_SESSION_FILES_TO_PARSE = 20;
const MAX_SESSION_FILE_BYTES = 25_000_000;
const ROLLOUT_FILE_PATTERN = /^rollout-.*\.jsonl$/i;

/**
 * Reads local Codex rollout JSONL files and extracts the latest rate-limit snapshot.
 *
 * @param homePath - Local Codex home directory to inspect.
 * @returns Session inspection result with safe file metadata and the latest snapshot.
 */
export async function readCodexSessions(homePath: string): Promise<CodexSessionReadResult> {
  const sessionsRoot = join(homePath, "sessions");
  const warnings: string[] = [];
  const candidates = await findSessionFiles(homePath, sessionsRoot, warnings);
  const files: CodexSessionFile[] = [];
  let latestSnapshot: CodexSessionSnapshot | null = null;

  for (const candidate of candidates.slice(0, MAX_SESSION_FILES_TO_PARSE)) {
    const relativePath = relative(homePath, candidate.path);

    if (candidate.size > MAX_SESSION_FILE_BYTES) {
      warnings.push(`Skipped ${relativePath} because it is too large to inspect safely.`);
      files.push(
        toSessionFile(candidate.path, relativePath, candidate.modifiedAtMs, false, "too-large")
      );
      continue;
    }

    try {
      const snapshot = await extractSnapshotFromSessionFile(homePath, candidate.path);
      files.push(
        toSessionFile(candidate.path, relativePath, candidate.modifiedAtMs, snapshot !== null, null)
      );

      if (snapshot && !latestSnapshot) {
        latestSnapshot = snapshot;
      }
    } catch {
      warnings.push(`Could not inspect ${relativePath}.`);
      files.push(
        toSessionFile(candidate.path, relativePath, candidate.modifiedAtMs, false, "read-error")
      );
    }

    if (latestSnapshot) {
      break;
    }
  }

  if (candidates.length > MAX_SESSION_FILES_TO_PARSE) {
    warnings.push(
      `Skipped ${candidates.length - MAX_SESSION_FILES_TO_PARSE} older session files to keep inspection small.`
    );
  }

  if (candidates.length > 0 && !latestSnapshot) {
    warnings.push("No token-count rate-limit snapshot was found in local Codex session logs.");
  }

  return {homePath, sessionsRoot, files, latestSnapshot, warnings};
}

/**
 * Finds local rollout JSONL files under the Codex sessions directory.
 *
 * @param homePath - Detected Codex home path used for relative warnings.
 * @param sessionsRoot - Sessions directory to inspect.
 * @param warnings - Mutable warning list for non-fatal inspection problems.
 * @returns Rollout JSONL candidates sorted newest first.
 */
async function findSessionFiles(
  homePath: string,
  sessionsRoot: string,
  warnings: string[]
): Promise<Array<{path: string; modifiedAtMs: number; size: number}>> {
  const files: string[] = [];
  await walkSessions(homePath, sessionsRoot, 0, files, warnings);

  const candidates = (
    await Promise.all(files.map((path) => statSessionFile(homePath, path, warnings)))
  ).filter(isSessionCandidate);

  return candidates.sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);
}

/**
 * Reads metadata for one rollout JSONL file without failing the whole scan.
 *
 * @param homePath - Detected Codex home path used for relative warnings.
 * @param path - Rollout JSONL file path to stat.
 * @param warnings - Mutable warning list for non-fatal inspection problems.
 * @returns Session file metadata, or null when the file cannot be inspected.
 */
async function statSessionFile(
  homePath: string,
  path: string,
  warnings: string[]
): Promise<{path: string; modifiedAtMs: number; size: number} | null> {
  try {
    const details = await stat(path);
    return {path, modifiedAtMs: details.mtimeMs, size: details.size};
  } catch {
    warnings.push(`Could not inspect ${relative(homePath, path)}.`);
    return null;
  }
}

/**
 * Narrows optional session candidate metadata after stat failures are removed.
 *
 * @param value - Candidate metadata or null.
 * @returns True when candidate metadata is present.
 */
function isSessionCandidate(
  value: {path: string; modifiedAtMs: number; size: number} | null
): value is {path: string; modifiedAtMs: number; size: number} {
  return value !== null;
}

/**
 * Walks the Codex sessions directory looking only for rollout JSONL files.
 *
 * @param homePath - Detected Codex home path used for relative warnings.
 * @param currentPath - Directory currently being inspected.
 * @param depth - Current traversal depth.
 * @param files - Mutable file list populated by the walker.
 * @param warnings - Mutable warning list for non-fatal inspection problems.
 * @returns Nothing; file and warning lists are updated in place.
 */
async function walkSessions(
  homePath: string,
  currentPath: string,
  depth: number,
  files: string[],
  warnings: string[]
): Promise<void> {
  if (depth > MAX_SESSION_DEPTH) {
    return;
  }

  let entries: Array<Dirent<string>>;
  try {
    entries = await readdir(currentPath, {withFileTypes: true});
  } catch {
    if (depth > 0) {
      warnings.push(`Could not inspect ${relative(homePath, currentPath)}.`);
    }
    return;
  }

  for (const entry of entries) {
    const entryPath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      await walkSessions(homePath, entryPath, depth + 1, files, warnings);
      continue;
    }

    if (entry.isFile() && ROLLOUT_FILE_PATTERN.test(entry.name)) {
      files.push(entryPath);
    }
  }
}

/**
 * Extracts the latest token-count rate-limit snapshot from one rollout JSONL file.
 *
 * @param homePath - Detected Codex home path used for relative metadata.
 * @param sessionFile - Rollout JSONL file to stream.
 * @returns Latest snapshot in the file, or null when none is present.
 */
async function extractSnapshotFromSessionFile(
  homePath: string,
  sessionFile: string
): Promise<CodexSessionSnapshot | null> {
  const relativePath = relative(homePath, sessionFile);
  const reader = createInterface({
    input: createReadStream(sessionFile, {encoding: "utf8"}),
    crlfDelay: Infinity,
  });
  let threadId: string | null = null;
  let latest: CodexSessionSnapshot | null = null;

  for await (const rawLine of reader) {
    const entry = parseJsonLine(rawLine);
    if (!entry) {
      continue;
    }

    const metadataThreadId = readSessionThreadId(entry);
    if (metadataThreadId) {
      threadId = metadataThreadId;
      continue;
    }

    const rateLimits = readRateLimits(entry);
    if (!rateLimits) {
      continue;
    }

    latest = {
      sessionFile,
      relativePath,
      threadId,
      eventTimestamp: readString(entry, "timestamp"),
      rateLimits,
    };
  }

  return latest;
}

/**
 * Parses one JSONL line without throwing on invalid JSON.
 *
 * @param rawLine - Raw JSONL line from a rollout file.
 * @returns Parsed record or null when the line is empty or invalid.
 */
function parseJsonLine(rawLine: string): Record<string, unknown> | null {
  const line = rawLine.trim();
  if (!line) {
    return null;
  }

  try {
    const parsed = JSON.parse(line) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Reads a thread id from a session_meta entry.
 *
 * @param entry - Parsed JSONL entry.
 * @returns Thread id when present, otherwise null.
 */
function readSessionThreadId(entry: Record<string, unknown>): string | null {
  if (entry.type !== "session_meta" || !isRecord(entry.payload)) {
    return null;
  }

  return readString(entry.payload, "id");
}

/**
 * Reads the rate_limits object from a token_count event.
 *
 * @param entry - Parsed JSONL entry.
 * @returns Rate limits object when present, otherwise null.
 */
function readRateLimits(entry: Record<string, unknown>): Record<string, unknown> | null {
  if (entry.type !== "event_msg" || !isRecord(entry.payload)) {
    return null;
  }

  if (entry.payload.type !== "token_count" || !isRecord(entry.payload.rate_limits)) {
    return null;
  }

  return entry.payload.rate_limits;
}

/**
 * Creates safe metadata for an inspected rollout JSONL file.
 *
 * @param path - Absolute file path.
 * @param relativePath - Path relative to the detected Codex home.
 * @param modifiedAtMs - Last modified time in milliseconds since epoch.
 * @param hasSnapshot - Whether a token-count snapshot was found.
 * @param error - Stable error code when inspection failed.
 * @returns Safe session file metadata.
 */
function toSessionFile(
  path: string,
  relativePath: string,
  modifiedAtMs: number,
  hasSnapshot: boolean,
  error: string | null
): CodexSessionFile {
  return {path, relativePath, modifiedAtMs, hasSnapshot, error};
}

/**
 * Reads a string property from a record.
 *
 * @param value - Record to inspect.
 * @param key - Property name to read.
 * @returns Non-empty string value or null.
 */
function readString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : null;
}

/**
 * Checks whether a value is a non-array object.
 *
 * @param value - Unknown value to inspect.
 * @returns True when the value is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
