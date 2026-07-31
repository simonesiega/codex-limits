import {basename, dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

/** Resolves the package root consistently from source and bundled agent code. */
export function resolvePackageRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return basename(moduleDirectory) === "dist"
    ? dirname(moduleDirectory)
    : resolve(moduleDirectory, "../../..");
}

/** Reports whether a path starts with the current-user tilde shorthand. */
export function hasTildePrefix(path: string): boolean {
  return path.startsWith("~/") || (process.platform === "win32" && path.startsWith("~\\"));
}

/** Resolves a path with optional current-user tilde shorthand. */
export function resolveTildePath(path: string, homeDirectory: string): string {
  if (path === "~") {
    return homeDirectory;
  }
  return hasTildePrefix(path) ? resolve(homeDirectory, path.slice(2)) : resolve(path);
}
