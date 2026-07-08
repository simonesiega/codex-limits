import type {Dirent} from "node:fs";
import {readdir, readFile, stat} from "node:fs/promises";
import {extname, join, relative} from "node:path";
import type {CodexStateFile, CodexStateReadResult} from "../types";

const MAX_DEPTH = 2;
const MAX_FILES = 25;
const MAX_FILE_BYTES = 1_000_000;
const SENSITIVE_FILE_PATTERN =
  /(?:auth|token|cookie|session|secret|credential|api[-_]?key|keychain)/i;

/**
 * Reads safe, small local Codex JSON files without exposing raw contents.
 *
 * @param homePath - Local Codex home directory to inspect.
 * @returns Parsed safe JSON files and non-sensitive warnings.
 */
export async function readCodexState(homePath: string): Promise<CodexStateReadResult> {
  const warnings: string[] = [];
  const paths = await findReadableStateFiles(homePath, warnings);
  const files: CodexStateFile[] = [];

  for (const filePath of paths.slice(0, MAX_FILES)) {
    const relativePath = relative(homePath, filePath);

    try {
      const details = await stat(filePath);
      if (details.size > MAX_FILE_BYTES) {
        warnings.push(`Skipped ${relativePath} because it is too large to inspect safely.`);
        continue;
      }

      const content = await readFile(filePath, "utf8");
      const json = parseJson(content, relativePath, warnings);

      files.push({
        path: filePath,
        relativePath,
        json: json.value,
        error: json.error,
      });
    } catch {
      warnings.push(`Could not read ${relativePath}.`);
    }
  }

  if (paths.length > MAX_FILES) {
    warnings.push(`Skipped ${paths.length - MAX_FILES} extra files to keep inspection small.`);
  }

  return {homePath, files, warnings};
}

/**
 * Finds JSON files that are safe to inspect under a Codex home.
 *
 * @param homePath - Root Codex home directory.
 * @param warnings - Mutable warning list for non-fatal inspection problems.
 * @returns Safe candidate JSON file paths.
 */
async function findReadableStateFiles(homePath: string, warnings: string[]): Promise<string[]> {
  const files: string[] = [];
  await walk(homePath, homePath, 0, files, warnings);
  return files.sort((left, right) => left.localeCompare(right));
}

/**
 * Walks a small, bounded portion of the Codex home looking for safe JSON files.
 *
 * @param rootPath - Original Codex home path used for relative warnings.
 * @param currentPath - Directory currently being inspected.
 * @param depth - Current traversal depth.
 * @param files - Mutable file list populated by the walker.
 * @param warnings - Mutable warning list for non-fatal inspection problems.
 * @returns Nothing; file and warning lists are updated in place.
 */
async function walk(
  rootPath: string,
  currentPath: string,
  depth: number,
  files: string[],
  warnings: string[]
): Promise<void> {
  if (depth > MAX_DEPTH || files.length >= MAX_FILES) {
    return;
  }

  let entries: Array<Dirent<string>>;
  try {
    entries = await readdir(currentPath, {withFileTypes: true});
  } catch {
    warnings.push(`Could not inspect ${relative(rootPath, currentPath) || "."}.`);
    return;
  }

  for (const entry of entries) {
    if (files.length >= MAX_FILES) {
      return;
    }

    const filePath = join(currentPath, entry.name);

    if (isSensitiveFileName(entry.name)) {
      warnings.push("Skipped a sensitive-looking local file.");
      continue;
    }

    if (entry.isDirectory()) {
      await walk(rootPath, filePath, depth + 1, files, warnings);
      continue;
    }

    if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
      files.push(filePath);
    }
  }
}

/**
 * Checks whether a filename looks sensitive enough to skip entirely.
 *
 * @param fileName - Directory entry name.
 * @returns True when the name suggests auth, token, cookie, session, or key material.
 */
function isSensitiveFileName(fileName: string): boolean {
  return SENSITIVE_FILE_PATTERN.test(fileName);
}

/**
 * Parses JSON while converting parse failures into safe warnings.
 *
 * @param content - File content to parse.
 * @param relativePath - Non-absolute path used in warnings.
 * @param warnings - Mutable warning list for parse failures.
 * @returns Parsed value and a stable error code when parsing fails.
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
