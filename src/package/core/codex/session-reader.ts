import type {Dirent} from "node:fs";
import {createReadStream} from "node:fs";
import {lstat, opendir, realpath, stat} from "node:fs/promises";
import {join} from "node:path";
import type {CodexSessionFile, CodexSessionReadResult, CodexSessionSnapshot} from "../types";
import {isPathWithin, toSafeRelativePath} from "../utils/safe-path";
import {isRecord, readString} from "../utils/unknown";

const MAX_SESSION_DEPTH = 8;
const MAX_SESSION_FILES_TO_PARSE = 20;
const MAX_DISCOVERED_SESSION_FILES = 1_000;
const MAX_SESSION_DIRECTORIES = 512;
const MAX_ENTRIES_PER_DIRECTORY = 1_000;
const MAX_SESSION_FILE_BYTES = 25_000_000;
const MAX_SESSION_LINE_BYTES = 1_000_000;
const ROLLOUT_FILE_PATTERN = /^rollout-.*\.jsonl$/i;

/**
 * Store the path, modified time, and size of a session file candidate for inspection.
 */
interface SessionCandidate {
  path: string;
  modifiedAtMs: number;
  size: number;
}

/**
 * Store the state of a session directory walk, including the number of directories and files found, whether a limit was hit, and whether any symbolic links were skipped.
 */
interface SessionWalkState {
  directories: number;
  files: string[];
  hitLimit: boolean;
  skippedSymlink: boolean;
}

/**
 * Store the result of extracting a snapshot from a session file, including the snapshot itself and whether any oversized lines were skipped.
 */
interface SnapshotExtraction {
  snapshot: CodexSessionSnapshot | null;
  skippedOversizedLine: boolean;
}

/**
 * Reads the local Codex sessions from the given home path, returning details about the sessions and any warnings encountered during the read process.
 * @param homePath - The path to the local Codex home directory containing session files.
 * @returns - A `CodexSessionReadResult` object containing the home path, sessions root, session files, latest snapshot, and any warnings.
 */
export async function readCodexSessions(homePath: string): Promise<CodexSessionReadResult> {
  const sessionsRoot = join(homePath, "sessions");
  const warnings: string[] = [];

  // Check if the sessions root is a symbolic link and skip it if so
  if (await isSymbolicLink(sessionsRoot)) {
    warnings.push("Skipped the symbolic-link Codex sessions directory.");
    return {homePath, sessionsRoot, files: [], latestSnapshot: null, warnings};
  }

  const candidates = await findSessionFiles(homePath, sessionsRoot, warnings);
  const files: CodexSessionFile[] = [];
  let latestSnapshot: CodexSessionSnapshot | null = null;

  for (const candidate of candidates.slice(0, MAX_SESSION_FILES_TO_PARSE)) {
    const relativePath = toSafeRelativePath(homePath, candidate.path);
    if (candidate.size > MAX_SESSION_FILE_BYTES) {
      warnings.push(`Skipped ${relativePath} because it is too large to inspect safely.`);
      files.push(
        toSessionFile(candidate.path, relativePath, candidate.modifiedAtMs, false, "too-large")
      );
      continue;
    }

    // Attempt to extract a snapshot from the session file, handling any errors that may occur
    try {
      const extraction = await extractSnapshotFromSessionFile(homePath, candidate.path);
      files.push(
        toSessionFile(
          candidate.path,
          relativePath,
          candidate.modifiedAtMs,
          extraction.snapshot !== null,
          null
        )
      );
      if (extraction.skippedOversizedLine) {
        warnings.push(`Skipped an oversized JSONL line in ${relativePath}.`);
      }
      if (extraction.snapshot && !latestSnapshot) {
        latestSnapshot = extraction.snapshot;
      }
    } catch (error) {
      const tooLarge = error instanceof SessionReadError && error.code === "too-large";
      warnings.push(
        tooLarge
          ? `Skipped ${relativePath} because it grew too large to inspect safely.`
          : `Could not inspect ${relativePath}.`
      );
      files.push(
        toSessionFile(
          candidate.path,
          relativePath,
          candidate.modifiedAtMs,
          false,
          tooLarge ? "too-large" : "read-error"
        )
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
 * Finds session files within the specified sessions root directory.
 * @param homePath - The path to the local Codex home directory.
 * @param sessionsRoot - The path to the sessions root directory.
 * @param warnings - An array to collect any warnings encountered during the search.
 * @returns - A promise resolving to an array of session file candidates.
 */
async function findSessionFiles(
  homePath: string,
  sessionsRoot: string,
  warnings: string[]
): Promise<SessionCandidate[]> {
  const state: SessionWalkState = {
    directories: 0,
    files: [],
    hitLimit: false,
    skippedSymlink: false,
  };
  await walkSessions(sessionsRoot, 0, state, warnings, homePath);

  if (state.hitLimit) {
    warnings.push("Stopped session discovery after reaching a safe inspection limit.");
  }
  if (state.skippedSymlink) {
    warnings.push("Skipped symbolic links while inspecting Codex sessions.");
  }

  let realSessionsRoot: string;
  try {
    realSessionsRoot = await realpath(sessionsRoot);
  } catch {
    return [];
  }

  const candidates: SessionCandidate[] = [];
  for (const path of state.files) {
    const candidate = await statSessionFile(homePath, realSessionsRoot, path, warnings);
    if (isSessionCandidate(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates.sort(
    (left, right) => right.modifiedAtMs - left.modifiedAtMs || left.path.localeCompare(right.path)
  );
}

/**
 * Stat a session file and return its details if it's a valid session file.
 * @param homePath - The path to the local Codex home directory.
 * @param realSessionsRoot - The real path to the sessions root directory.
 * @param path - The path to the session file candidate.
 * @param warnings - An array to collect any warnings encountered during the stat operation.
 * @returns - A promise resolving to a `SessionCandidate` if the file is valid, or null otherwise.
 */
async function statSessionFile(
  homePath: string,
  realSessionsRoot: string,
  path: string,
  warnings: string[]
): Promise<SessionCandidate | null> {
  try {
    const [details, realFilePath] = await Promise.all([stat(path), realpath(path)]);
    if (!details.isFile() || !isPathWithin(realSessionsRoot, realFilePath)) {
      warnings.push(`Could not inspect ${toSafeRelativePath(homePath, path)}.`);
      return null;
    }
    return {path, modifiedAtMs: details.mtimeMs, size: details.size};
  } catch {
    warnings.push(`Could not inspect ${toSafeRelativePath(homePath, path)}.`);
    return null;
  }
}

/**
 * Checks whether a value is a `SessionCandidate`.
 * @param value - The value to check.
 * @returns - True if the value is a `SessionCandidate`, false otherwise.
 */
function isSessionCandidate(value: SessionCandidate | null): value is SessionCandidate {
  return value !== null;
}

/**
 * Recursively walks through the sessions directory to find session files.
 * @param currentPath - The current directory path being inspected.
 * @param depth - The current depth of the directory walk.
 * @param state - The state object to track the discovery process.
 * @param warnings - An array to collect any warnings encountered during the walk.
 * @param homePath - The path to the local Codex home directory.
 * @returns - A promise resolving when the walk is complete.
 */
async function walkSessions(
  currentPath: string,
  depth: number,
  state: SessionWalkState,
  warnings: string[],
  homePath: string
): Promise<void> {
  if (depth > MAX_SESSION_DEPTH || state.files.length >= MAX_DISCOVERED_SESSION_FILES) {
    state.hitLimit ||= state.files.length >= MAX_DISCOVERED_SESSION_FILES;
    return;
  }
  if (state.directories >= MAX_SESSION_DIRECTORIES) {
    state.hitLimit = true;
    return;
  }
  state.directories += 1;

  let entries: Dirent[];
  try {
    entries = await readBoundedDirectory(currentPath, state);
  } catch {
    if (depth > 0) {
      warnings.push(`Could not inspect ${toSafeRelativePath(homePath, currentPath)}.`);
    }
    return;
  }

  for (const entry of entries) {
    if (state.files.length >= MAX_DISCOVERED_SESSION_FILES) {
      state.hitLimit = true;
      return;
    }

    const entryPath = join(currentPath, entry.name);
    if (entry.isSymbolicLink()) {
      state.skippedSymlink = true;
      continue;
    }
    if (entry.isDirectory()) {
      await walkSessions(entryPath, depth + 1, state, warnings, homePath);
      continue;
    }
    if (entry.isFile() && ROLLOUT_FILE_PATTERN.test(entry.name)) {
      state.files.push(entryPath);
      if (state.files.length >= MAX_DISCOVERED_SESSION_FILES) {
        state.hitLimit = true;
        return;
      }
    }
  }
}

/**
 * Read the contents of a directory, returning a sorted list of entries while respecting a maximum entry limit.
 * @param currentPath - The path of the directory to read.
 * @param state - The state object tracking the discovery process, including whether the entry limit has been hit.
 * @returns - A promise resolving to an array of directory entries (`Dirent`), sorted by name in descending order.
 */
async function readBoundedDirectory(
  currentPath: string,
  state: SessionWalkState
): Promise<Dirent[]> {
  const directory = await opendir(currentPath);
  const entries: Dirent[] = [];

  for await (const entry of directory) {
    if (entries.length >= MAX_ENTRIES_PER_DIRECTORY) {
      state.hitLimit = true;
      break;
    }
    entries.push(entry);
  }

  // Newer date-based session folders are normally lexically later, so inspect them first.
  return entries.sort((left, right) => right.name.localeCompare(left.name));
}

/**
 * Extracts a snapshot from a session file, returning the snapshot and whether any oversized lines were skipped during the extraction process.
 * @param homePath - The path to the local Codex home directory.
 * @param sessionFile - The path to the session file from which to extract the snapshot.
 * @returns - A promise resolving to a `SnapshotExtraction` object containing the extracted snapshot (if any) and a flag indicating whether any oversized lines were skipped.
 */
async function extractSnapshotFromSessionFile(
  homePath: string,
  sessionFile: string
): Promise<SnapshotExtraction> {
  const relativePath = toSafeRelativePath(homePath, sessionFile);
  const stream = createReadStream(sessionFile, {encoding: "utf8", highWaterMark: 64 * 1024});
  let threadId: string | null = null;
  let latest: CodexSessionSnapshot | null = null;
  let pending = "";
  let pendingBytes = 0;
  let totalBytes = 0;
  let discardingLine = false;
  let skippedOversizedLine = false;

  for await (const rawChunk of stream) {
    const chunk = String(rawChunk);
    totalBytes += Buffer.byteLength(chunk, "utf8");
    if (totalBytes > MAX_SESSION_FILE_BYTES) {
      throw new SessionReadError("too-large");
    }

    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf("\n", offset);
      const end = newline === -1 ? chunk.length : newline;
      const part = chunk.slice(offset, end);

      if (!discardingLine) {
        const partBytes = Buffer.byteLength(part, "utf8");
        if (pendingBytes + partBytes > MAX_SESSION_LINE_BYTES) {
          pending = "";
          pendingBytes = 0;
          discardingLine = true;
          skippedOversizedLine = true;
        } else {
          pending += part;
          pendingBytes += partBytes;
        }
      }

      if (newline === -1) {
        break;
      }

      if (!discardingLine) {
        const parsed = parseSnapshotLine(pending.endsWith("\r") ? pending.slice(0, -1) : pending);
        if (parsed.threadId) {
          threadId = parsed.threadId;
        }
        if (parsed.rateLimits) {
          latest = {
            sessionFile,
            relativePath,
            threadId,
            eventTimestamp: parsed.timestamp,
            rateLimits: parsed.rateLimits,
          };
        }
      }

      pending = "";
      pendingBytes = 0;
      discardingLine = false;
      offset = newline + 1;
    }
  }

  if (!discardingLine && pending.length > 0) {
    const parsed = parseSnapshotLine(pending.endsWith("\r") ? pending.slice(0, -1) : pending);
    if (parsed.threadId) {
      threadId = parsed.threadId;
    }
    if (parsed.rateLimits) {
      latest = {
        sessionFile,
        relativePath,
        threadId,
        eventTimestamp: parsed.timestamp,
        rateLimits: parsed.rateLimits,
      };
    }
  }

  return {snapshot: latest, skippedOversizedLine};
}

/**
 * Parses a single line from a session file to extract the thread ID, timestamp, and rate limits if present.
 * @param rawLine - The raw line from the session file to parse.
 * @returns - An object containing the extracted thread ID, timestamp, and rate limits, or null values if they are not present or the line is invalid.
 */
function parseSnapshotLine(rawLine: string): {
  threadId: string | null;
  timestamp: string | null;
  rateLimits: Record<string, unknown> | null;
} {
  const entry = parseJsonLine(rawLine);
  if (!entry) {
    return {threadId: null, timestamp: null, rateLimits: null};
  }

  return {
    threadId: readSessionThreadId(entry),
    timestamp: readString(entry, "timestamp"),
    rateLimits: readRateLimits(entry),
  };
}

/**
 * Parses a single line from a session file to extract a JSON object.
 * @param rawLine - The raw line from the session file to parse.
 * @returns - The parsed JSON object, or null if the line is not valid JSON.
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
 * Reads the session thread ID from a parsed entry.
 * @param entry - The parsed entry from the session file.
 * @returns - The session thread ID, or null if not found.
 */
function readSessionThreadId(entry: Record<string, unknown>): string | null {
  if (entry.type !== "session_meta" || !isRecord(entry.payload)) {
    return null;
  }
  return readString(entry.payload, "id");
}

/**
 * Reads the rate limits from a parsed entry.
 * @param entry - The parsed entry from the session file.
 * @returns - The rate limits object, or null if not found.
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
 * Creates a `CodexSessionFile` object from the provided parameters.
 * @param path - The path to the session file.
 * @param relativePath - The relative path to the session file.
 * @param modifiedAtMs - The timestamp of the last modification in milliseconds.
 * @param hasSnapshot - A flag indicating whether the session file has a snapshot.
 * @param error - An error message, or null if no error occurred.
 * @returns - A `CodexSessionFile` object.
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
 * Checks whether the specified path is a symbolic link.
 * @param path - The path to check.
 * @returns - A promise resolving to true if the path is a symbolic link, false otherwise.
 */
async function isSymbolicLink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Custom error class for session reading errors, specifically for cases where a session file is too large to process safely.
 */
class SessionReadError extends Error {
  readonly code: "too-large";

  constructor(code: "too-large") {
    super(code);
    this.code = code;
  }
}
