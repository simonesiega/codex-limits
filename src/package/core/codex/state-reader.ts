import type {Dirent} from "node:fs";
import {opendir} from "node:fs/promises";
import {extname, join} from "node:path";
import type {CodexStateFile, CodexStateReadResult} from "../types";
import {BoundedFileError, readBoundedUtf8File} from "../utils/bounded-file";
import {toSafeRelativePath} from "../utils/safe-path";

const MAX_DEPTH = 2;
const MAX_FILES = 25;
const MAX_DISCOVERED_FILES = 100;
const MAX_DIRECTORIES = 64;
const MAX_ENTRIES_PER_DIRECTORY = 500;
const MAX_FILE_BYTES = 1_000_000;
const SENSITIVE_FILE_PATTERN =
  /(?:auth|token|cookie|session|secret|credential|api[-_]?key|keychain)/i;

/**
 * Store state while walking the local filesystem to discover Codex JSON files.
 */
interface WalkState {
  // The number of directories that have been traversed so far.
  directories: number;

  files: string[];
  hitDirectoryLimit: boolean;
  hitEntryLimit: boolean;
  hitFileLimit: boolean;
  skippedSensitive: boolean;
  skippedSymlink: boolean;
  warnings: string[];
}

/**
 * Reads the local Codex state from the specified home path, returning a list of discovered JSON files and any warnings encountered during the process.
 * @param homePath - The path to the local Codex home directory.
 * @returns - A promise resolving to a `CodexStateReadResult` object containing the discovered files and any warnings.
 */
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
  await walk(homePath, homePath, 0, state);

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

    // Attempt to read the file content, parse it as JSON, and handle any errors that may occur during the process.
    try {
      const content = await readBoundedUtf8File(filePath, MAX_FILE_BYTES);
      const json = parseJson(content, relativePath, state.warnings);
      files.push({path: filePath, relativePath, json: json.value, error: json.error});
    } catch (error) {
      if (error instanceof BoundedFileError && error.code === "too-large") {
        state.warnings.push(`Skipped ${relativePath} because it is too large to inspect safely.`);
      } else {
        state.warnings.push(`Could not read ${relativePath}.`);
      }
    }
  }

  if (paths.length > MAX_FILES) {
    state.warnings.push(
      `Skipped ${paths.length - MAX_FILES} extra files to keep inspection small.`
    );
  }

  return {homePath, files, warnings: state.warnings};
}

/**
 * Performs a depth-first traversal of the local filesystem starting from the specified root path, discovering JSON files while respecting various limits to ensure safe inspection.
 * @param rootPath - The root path from which to start the traversal.
 * @param currentPath - The current path being traversed.
 * @param depth - The current depth of the traversal, used to enforce a maximum depth limit.
 * @param state - The state object that tracks the number of directories traversed, discovered files, and any warnings or limits encountered during the traversal.
 * @returns - A promise that resolves when the traversal is complete.
 */
async function walk(
  rootPath: string,
  currentPath: string,
  depth: number,
  state: WalkState
): Promise<void> {
  if (depth > MAX_DEPTH || state.files.length >= MAX_DISCOVERED_FILES) {
    state.hitFileLimit ||= state.files.length >= MAX_DISCOVERED_FILES;
    return;
  }
  if (state.directories >= MAX_DIRECTORIES) {
    state.hitDirectoryLimit = true;
    return;
  }
  state.directories += 1;

  const entries = await readBoundedDirectory(rootPath, currentPath, state);
  for (const entry of entries) {
    if (state.files.length >= MAX_DISCOVERED_FILES) {
      state.hitFileLimit = true;
      return;
    }

    if (isSensitiveFileName(entry.name)) {
      state.skippedSensitive = true;
      continue;
    }

    const entryPath = join(currentPath, entry.name);
    if (entry.isSymbolicLink()) {
      state.skippedSymlink = true;
      continue;
    }
    if (entry.isDirectory()) {
      await walk(rootPath, entryPath, depth + 1, state);
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
      state.files.push(entryPath);
    }
  }
}

/**
 * Reads the contents of a directory at the specified path, returning a list of directory entries while respecting a maximum entry limit to ensure safe inspection.
 * @param rootPath - The root path of the directory to read.
 * @param currentPath - The current path being read.
 * @param state - The state object that tracks the number of entries discovered and any warnings or limits encountered during the process.
 * @returns - A promise resolving to a list of directory entries.
 */
async function readBoundedDirectory(
  rootPath: string,
  currentPath: string,
  state: WalkState
): Promise<Dirent[]> {
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
    state.warnings.push(`Could not inspect ${toSafeRelativePath(rootPath, currentPath)}.`);
    return [];
  }
}

/**
 * Check if a given file name matches a sensitive pattern, indicating that it may contain sensitive information and should be skipped during inspection.
 * @param fileName - The name of the file to check.
 * @returns - True if the file name matches a sensitive pattern, false otherwise.
 */
function isSensitiveFileName(fileName: string): boolean {
  return SENSITIVE_FILE_PATTERN.test(fileName);
}

/**
 * Parses a JSON string and returns the parsed value along with any error information.
 * @param content - The JSON string to parse.
 * @param relativePath - The relative path of the file being parsed, used for error reporting.
 * @param warnings - An array to which any warnings encountered during parsing will be added.
 * @returns - An object containing the parsed value (or null if parsing failed) and an error code (or null if parsing succeeded).
 */
function parseJson(
  content: string,
  relativePath: string,
  warnings: string[]
): {value: unknown | null; error: string | null} {
  try {
    return {value: JSON.parse(content) as unknown, error: null};
  } catch {
    warnings.push(`Could not parse JSON in ${relativePath}.`);
    return {value: null, error: "invalid-json"};
  }
}
