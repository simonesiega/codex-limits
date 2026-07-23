import type {Dirent} from "node:fs";
import {opendir} from "node:fs/promises";
import {extname, join} from "node:path";
import type {CodexStateFile, CodexStateReadResult} from "@/package/core/types";
import {BoundedFileError, readBoundedUtf8File} from "@/package/core/utils/bounded-file";
import {toSafeRelativePath} from "@/package/core/utils/safe-path";

const MAX_DEPTH = 2;
const MAX_FILES = 25;
const MAX_DISCOVERED_FILES = 100;
const MAX_DIRECTORIES = 64;
const MAX_ENTRIES_PER_DIRECTORY = 500;
const MAX_FILE_BYTES = 1_000_000;
const SENSITIVE_FILE_PATTERN =
  /(?:auth|token|cookie|session|secret|credential|api[-_]?key|keychain)/i;

interface WalkState {
  directories: number;
  files: string[];
  hitDirectoryLimit: boolean;
  hitEntryLimit: boolean;
  hitFileLimit: boolean;
  skippedSensitive: boolean;
  skippedSymlink: boolean;
  warnings: string[];
}

/** Discovers and parses a small, non-sensitive set of local Codex JSON state files. */
export async function readCodexState(homePath: string): Promise<CodexStateReadResult> {
  const state: WalkState = {
    directories: 0,
    files: [],
    hitDirectoryLimit: false,
    hitEntryLimit: false,
    hitFileLimit: false,
    skippedSensitive: false,
    skippedSymlink: false,
    warnings: [],
  };
  await walk(homePath, 0, state);

  if (state.hitDirectoryLimit || state.hitEntryLimit || state.hitFileLimit) {
    state.warnings.push("Stopped local state discovery after reaching a safe inspection limit.");
  }
  if (state.skippedSensitive) {
    state.warnings.push("Skipped a sensitive-looking local file.");
  }
  if (state.skippedSymlink) {
    state.warnings.push("Skipped symbolic links while inspecting local Codex state.");
  }

  const paths = state.files.sort((left, right) => left.localeCompare(right));
  const files: CodexStateFile[] = [];
  for (const filePath of paths.slice(0, MAX_FILES)) {
    const relativePath = toSafeRelativePath(homePath, filePath);
    try {
      const content = await readBoundedUtf8File(filePath, MAX_FILE_BYTES);
      const json = parseJson(content, state.warnings);
      files.push({path: filePath, relativePath, json: json.value, error: json.error});
    } catch (error) {
      state.warnings.push(
        error instanceof BoundedFileError && error.code === "too-large"
          ? "Skipped a local Codex state file because it is too large to inspect safely."
          : "Could not read a local Codex state file safely."
      );
    }
  }

  if (paths.length > MAX_FILES) {
    state.warnings.push(
      `Skipped ${paths.length - MAX_FILES} extra files to keep inspection small.`
    );
  }
  return {homePath, files, warnings: state.warnings};
}

async function walk(currentPath: string, depth: number, state: WalkState): Promise<void> {
  if (depth > MAX_DEPTH || state.files.length >= MAX_DISCOVERED_FILES) {
    state.hitFileLimit ||= state.files.length >= MAX_DISCOVERED_FILES;
    return;
  }
  if (state.directories >= MAX_DIRECTORIES) {
    state.hitDirectoryLimit = true;
    return;
  }
  state.directories += 1;

  const entries = await readBoundedDirectory(currentPath, state);
  for (const entry of entries) {
    if (state.files.length >= MAX_DISCOVERED_FILES) {
      state.hitFileLimit = true;
      return;
    }
    if (SENSITIVE_FILE_PATTERN.test(entry.name)) {
      state.skippedSensitive = true;
      continue;
    }

    const entryPath = join(currentPath, entry.name);
    if (entry.isSymbolicLink()) {
      state.skippedSymlink = true;
    } else if (entry.isDirectory()) {
      await walk(entryPath, depth + 1, state);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
      state.files.push(entryPath);
    }
  }
}

async function readBoundedDirectory(currentPath: string, state: WalkState): Promise<Dirent[]> {
  try {
    const directory = await opendir(currentPath);
    const entries: Dirent[] = [];
    for await (const entry of directory) {
      if (entries.length >= MAX_ENTRIES_PER_DIRECTORY) {
        state.hitEntryLimit = true;
        break;
      }
      entries.push(entry);
    }
    return entries.sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    state.warnings.push("Could not inspect part of the local Codex state directory safely.");
    return [];
  }
}

function parseJson(
  content: string,
  warnings: string[]
): {value: unknown | null; error: string | null} {
  try {
    return {value: JSON.parse(content) as unknown, error: null};
  } catch {
    warnings.push("Could not parse JSON in a local Codex state file.");
    return {value: null, error: "invalid-json"};
  }
}
