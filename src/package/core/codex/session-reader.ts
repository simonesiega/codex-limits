import {constants} from "node:fs";
import type {Dirent, ReadStream, Stats} from "node:fs";
import type {FileHandle} from "node:fs/promises";
import {lstat, open, opendir, realpath} from "node:fs/promises";
import {join} from "node:path";
import type {
  CodexSessionFile,
  CodexSessionReadResult,
  CodexSessionSnapshot,
} from "@/package/core/types";
import {isPathWithin, toSafeRelativePath} from "@/package/core/utils/safe-path";
import {isRecord, readString} from "@/package/core/utils/unknown";

const MAX_SESSION_DEPTH = 8;
const MAX_SESSION_FILES_TO_PARSE = 20;
const MAX_DISCOVERED_SESSION_FILES = 1_000;
const MAX_SESSION_DIRECTORIES = 512;
const MAX_ENTRIES_PER_DIRECTORY = 1_000;
const MAX_SESSION_FILE_BYTES = 25_000_000;
const MAX_SESSION_LINE_BYTES = 1_000_000;
const ROLLOUT_FILE_PATTERN = /^rollout-.*\.jsonl$/i;

interface SessionCandidate {
  path: string;
  modifiedAtMs: number;
  size: number;
  dev: number;
  ino: number;
}

interface SessionWalkState {
  directories: number;
  files: string[];
  hitLimit: boolean;
  skippedSymlink: boolean;
}

interface SnapshotExtraction {
  snapshot: CodexSessionSnapshot | null;
  skippedOversizedLine: boolean;
}

/** Finds the newest bounded local rate-limit snapshot without following nested symlinks. */
export async function readCodexSessions(homePath: string): Promise<CodexSessionReadResult> {
  const sessionsRoot = join(homePath, "sessions");
  const warnings: string[] = [];
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
    try {
      const extraction = await extractSnapshotFromSessionFile(homePath, candidate);
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
      const tooLarge = error instanceof SessionTooLargeError;
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
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates.sort(
    (left, right) => right.modifiedAtMs - left.modifiedAtMs || left.path.localeCompare(right.path)
  );
}

async function statSessionFile(
  homePath: string,
  realSessionsRoot: string,
  path: string,
  warnings: string[]
): Promise<SessionCandidate | null> {
  try {
    const [details, realFilePath] = await Promise.all([lstat(path), realpath(path)]);
    if (!details.isFile() || !isPathWithin(realSessionsRoot, realFilePath)) {
      warnings.push(`Could not inspect ${toSafeRelativePath(homePath, path)}.`);
      return null;
    }
    return {
      path,
      modifiedAtMs: details.mtimeMs,
      size: details.size,
      dev: details.dev,
      ino: details.ino,
    };
  } catch {
    warnings.push(`Could not inspect ${toSafeRelativePath(homePath, path)}.`);
    return null;
  }
}

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

async function extractSnapshotFromSessionFile(
  homePath: string,
  candidate: SessionCandidate
): Promise<SnapshotExtraction> {
  const sessionFile = candidate.path;
  const relativePath = toSafeRelativePath(homePath, sessionFile);
  const stream = await openVerifiedSessionStream(candidate);
  let threadId: string | null = null;
  let latest: CodexSessionSnapshot | null = null;
  let pending = "";
  let pendingBytes = 0;
  let totalBytes = 0;
  let discardingLine = false;
  let skippedOversizedLine = false;

  // Discard only an oversized line, not the stream, so a later safe snapshot can still be used.
  for await (const rawChunk of stream) {
    const chunk = String(rawChunk);
    totalBytes += Buffer.byteLength(chunk, "utf8");
    if (totalBytes > MAX_SESSION_FILE_BYTES) {
      throw new SessionTooLargeError();
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

async function openVerifiedSessionStream(candidate: SessionCandidate): Promise<ReadStream> {
  let handle: FileHandle | undefined;

  try {
    const pathDetails = await lstat(candidate.path);
    if (!pathDetails.isFile() || !isSameFile(pathDetails, candidate)) {
      throw new SessionFileChangedError();
    }

    const noFollow = constants.O_NOFOLLOW;
    const openFlags =
      typeof noFollow === "number" ? constants.O_RDONLY | noFollow : constants.O_RDONLY;
    handle = await open(candidate.path, openFlags);
    const [openedDetails, currentPathDetails] = await Promise.all([
      handle.stat(),
      lstat(candidate.path),
    ]);
    if (
      !openedDetails.isFile() ||
      !currentPathDetails.isFile() ||
      !isSameFile(openedDetails, candidate) ||
      !isSameFile(openedDetails, currentPathDetails)
    ) {
      throw new SessionFileChangedError();
    }
    if (openedDetails.size > MAX_SESSION_FILE_BYTES) {
      throw new SessionTooLargeError();
    }

    // The stream owns and closes the verified descriptor on completion or failure.
    return handle.createReadStream({encoding: "utf8", highWaterMark: 64 * 1024});
  } catch (error) {
    await handle?.close().catch(() => undefined);
    throw error;
  }
}

function isSameFile(left: Pick<Stats, "dev" | "ino">, right: Pick<Stats, "dev" | "ino">): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

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

function readSessionThreadId(entry: Record<string, unknown>): string | null {
  if (entry.type !== "session_meta" || !isRecord(entry.payload)) {
    return null;
  }
  return readString(entry.payload, "id");
}

function readRateLimits(entry: Record<string, unknown>): Record<string, unknown> | null {
  if (entry.type !== "event_msg" || !isRecord(entry.payload)) {
    return null;
  }
  if (entry.payload.type !== "token_count" || !isRecord(entry.payload.rate_limits)) {
    return null;
  }
  return entry.payload.rate_limits;
}

function toSessionFile(
  path: string,
  relativePath: string,
  modifiedAtMs: number,
  hasSnapshot: boolean,
  error: string | null
): CodexSessionFile {
  return {path, relativePath, modifiedAtMs, hasSnapshot, error};
}

async function isSymbolicLink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

class SessionTooLargeError extends Error {}

class SessionFileChangedError extends Error {}
