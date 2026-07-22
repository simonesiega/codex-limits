import {lstat, stat} from "node:fs/promises";
import {homedir} from "node:os";
import {basename, dirname, isAbsolute, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {writeAgentJsonAtomically} from "@/agents/shared/json-config";
import {
  AgentInstallError,
  type AgentInstallResult,
  type AgentIntegrationStatus,
} from "@/agents/types";
import {BoundedFileError, readBoundedUtf8File} from "@/package/core/utils/bounded-file";
import type {EnvironmentMap} from "@/package/core/types";
import {isRecord} from "@/package/core/utils/unknown";

const PACKAGE_NAME = "@simonesiega/codex-limits";
const PI_BUNDLE_PATH = "dist/pi.js";
const MAX_MANIFEST_BYTES = 100_000;
const MAX_SETTINGS_BYTES = 1_000_000;

type PiPackageEntry = string | (Record<string, unknown> & {source: string});

interface PiConfigOptions {
  settingsPath?: string;
  packageRoot?: string;
  agentDirectory?: string;
  homeDirectory?: string;
  env?: EnvironmentMap;
}

/** Registers the current Codex Limits package in pi's global settings. */
export async function installPiIntegration(
  options: PiConfigOptions = {}
): Promise<AgentInstallResult> {
  const paths = resolvePiPaths(options);
  const settings = await readPiSettings(paths.settingsPath);
  const packages = readPackageEntries(settings.packages);
  const matchingIndexes = packages
    .map((entry, index) =>
      isCodexLimitsPackage(entry, paths.packageRoot, paths.settingsPath, paths.homeDirectory)
        ? index
        : -1
    )
    .filter((index) => index >= 0);
  const matchingIndex =
    matchingIndexes.find((index) => {
      const entry = packages[index];
      return entry !== undefined && isPackageEntryEnabled(entry);
    }) ?? matchingIndexes[0];

  let changed = false;
  if (matchingIndex !== undefined) {
    const matching = packages[matchingIndex];
    if (
      matching &&
      !isNpmCodexLimitsPackage(matching) &&
      !(await isPiPackageAvailable(paths.packageRoot))
    ) {
      throw new AgentInstallError("The pi integration bundle is unavailable.");
    }
    if (matching && typeof matching !== "string" && !isPackageEntryEnabled(matching)) {
      packages[matchingIndex] = enablePackageEntry(matching);
      changed = true;
    }
  } else {
    if (!(await isPiPackageAvailable(paths.packageRoot))) {
      throw new AgentInstallError("The pi integration bundle is unavailable.");
    }
    packages.push(paths.packageRoot);
    changed = true;
  }

  if (changed) {
    settings.packages = packages;
    try {
      await writeAgentJsonAtomically(paths.settingsPath, settings);
    } catch {
      throw new AgentInstallError("Could not safely update the pi settings.");
    }
  }

  return {changed, configPaths: [paths.settingsPath]};
}

/** Checks pi's bounded global settings without returning package or configuration paths. */
export async function inspectPiIntegration(
  options: PiConfigOptions = {}
): Promise<AgentIntegrationStatus> {
  const paths = resolvePiPaths(options);

  try {
    const settings = await readPiSettings(paths.settingsPath);
    const packages = readPackageEntries(settings.packages);
    const configured = packages.some(
      (entry) =>
        isPackageEntryEnabled(entry) &&
        isCodexLimitsPackage(entry, paths.packageRoot, paths.settingsPath, paths.homeDirectory)
    );
    return configured ? "installed" : "not-installed";
  } catch {
    return "unknown";
  }
}

interface ResolvedPiPaths {
  settingsPath: string;
  packageRoot: string;
  homeDirectory: string;
}

function resolvePiPaths(options: PiConfigOptions): ResolvedPiPaths {
  const homeDirectory = resolve(options.homeDirectory ?? homedir());
  const env = options.env ?? process.env;
  const configuredDirectory = options.agentDirectory ?? env.PI_CODING_AGENT_DIR ?? "";
  const agentDirectory = configuredDirectory
    ? resolveTildePath(configuredDirectory, homeDirectory)
    : join(homeDirectory, ".pi", "agent");

  return {
    settingsPath: resolve(options.settingsPath ?? join(agentDirectory, "settings.json")),
    packageRoot: resolve(options.packageRoot ?? getCurrentPackageRoot()),
    homeDirectory,
  };
}

function getCurrentPackageRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return basename(moduleDirectory) === "dist"
    ? dirname(moduleDirectory)
    : resolve(moduleDirectory, "../../..");
}

function resolveTildePath(path: string, homeDirectory: string): string {
  if (path === "~") {
    return homeDirectory;
  }
  if (hasTildePrefix(path)) {
    return resolve(homeDirectory, path.slice(2));
  }
  return resolve(path);
}

function hasTildePrefix(path: string): boolean {
  return path.startsWith("~/") || (process.platform === "win32" && path.startsWith("~\\"));
}

async function isPiPackageAvailable(packageRoot: string): Promise<boolean> {
  try {
    const [rootDetails, bundleDetails, manifestContent] = await Promise.all([
      stat(packageRoot),
      lstat(join(packageRoot, PI_BUNDLE_PATH)),
      readBoundedUtf8File(join(packageRoot, "package.json"), MAX_MANIFEST_BYTES),
    ]);
    const manifest = JSON.parse(manifestContent) as unknown;
    if (!rootDetails.isDirectory() || !bundleDetails.isFile() || !isRecord(manifest)) {
      return false;
    }

    const piManifest = manifest.pi;
    return (
      manifest.name === PACKAGE_NAME &&
      isRecord(piManifest) &&
      Array.isArray(piManifest.extensions) &&
      piManifest.extensions.some(
        (entry) => typeof entry === "string" && normalizeExactPackagePath(entry) === PI_BUNDLE_PATH
      )
    );
  } catch {
    return false;
  }
}

async function readPiSettings(path: string): Promise<Record<string, unknown>> {
  let content: string;
  try {
    content = await readBoundedUtf8File(path, MAX_SETTINGS_BYTES);
  } catch (error) {
    if (error instanceof BoundedFileError) {
      if (error.code === "not-found") {
        return {};
      }
      if (error.code === "too-large") {
        throw new AgentInstallError("Pi settings are too large to update safely.");
      }
    }
    throw new AgentInstallError("Could not safely read the pi settings.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new AgentInstallError("pi settings must contain valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new AgentInstallError("pi settings must be a JSON object.");
  }
  return parsed;
}

function readPackageEntries(value: unknown): PiPackageEntry[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every(isPackageEntry)) {
    throw new AgentInstallError("pi settings field `packages` must contain package sources.");
  }
  return [...value];
}

function isPackageEntry(value: unknown): value is PiPackageEntry {
  if (typeof value === "string") {
    return Boolean(value.trim());
  }
  if (!isRecord(value) || typeof value.source !== "string" || !value.source.trim()) {
    return false;
  }
  return (
    value.extensions === undefined ||
    (Array.isArray(value.extensions) &&
      value.extensions.every((entry) => typeof entry === "string" && entry.length <= 1_024))
  );
}

function isPackageEntryEnabled(entry: PiPackageEntry): boolean {
  if (typeof entry === "string") {
    return true;
  }
  if (entry.extensions === undefined) {
    return entry.autoload !== false;
  }
  if (!Array.isArray(entry.extensions) || entry.extensions.length === 0) {
    return false;
  }
  if (entry.autoload === false) {
    return isPiBundleEnabledByDelta(entry.extensions);
  }

  const includes = entry.extensions.filter((filter) => !/^[!+-]/.test(filter));
  const excludes = entry.extensions.filter((filter) => filter.startsWith("!"));
  const forceIncludes = entry.extensions.filter((filter) => filter.startsWith("+"));
  const forceExcludes = entry.extensions.filter((filter) => filter.startsWith("-"));
  let enabled = includes.length === 0 || includes.some((filter) => matchesPiBundlePattern(filter));

  if (
    excludes.some((filter) => {
      const matches = matchesPiBundlePattern(filter.slice(1));
      return matches === true || matches === null;
    })
  ) {
    enabled = false;
  }
  if (forceIncludes.some((filter) => isExactPiBundlePath(filter.slice(1)))) {
    enabled = true;
  }
  if (forceExcludes.some((filter) => isExactPiBundlePath(filter.slice(1)))) {
    enabled = false;
  }
  return enabled;
}

function isPiBundleEnabledByDelta(filters: string[]): boolean {
  let enabled = false;

  // Pi applies autoload deltas in declaration order, so the last matching filter wins.
  for (const filter of filters) {
    const prefix = /^[!+-]/.test(filter) ? filter[0]! : "";
    const pattern = prefix ? filter.slice(1) : filter;
    const matches =
      prefix === "+" || prefix === "-"
        ? isExactPiBundlePath(pattern)
        : matchesPiBundlePattern(pattern);
    if (matches === false || (matches === null && prefix !== "!")) {
      continue;
    }
    enabled = prefix !== "!" && prefix !== "-";
  }

  return enabled;
}

function enablePackageEntry(entry: Exclude<PiPackageEntry, string>): PiPackageEntry {
  const extensions = Array.isArray(entry.extensions) ? entry.extensions : [];
  if (entry.autoload === false) {
    // Moving the exact include last wins over earlier entries in pi's ordered delta mode.
    const otherExtensions = extensions.filter(
      (filter) => !(filter.startsWith("+") && isExactPiBundlePath(filter.slice(1)))
    );
    return {...entry, extensions: [...otherExtensions, `+${PI_BUNDLE_PATH}`]};
  }

  const enabledExtensions = extensions.filter(
    (filter) => !(filter.startsWith("-") && isExactPiBundlePath(filter.slice(1)))
  );
  if (
    !enabledExtensions.some(
      (filter) => filter.startsWith("+") && isExactPiBundlePath(filter.slice(1))
    )
  ) {
    enabledExtensions.push(`+${PI_BUNDLE_PATH}`);
  }
  return {...entry, extensions: enabledExtensions};
}

function matchesPiBundlePattern(pattern: string): boolean | null {
  const normalizedPattern = normalizePackagePath(pattern);
  if (/[\[\]{}()]/.test(normalizedPattern)) {
    return null;
  }
  const expression = globToRegExp(normalizedPattern);
  return expression.test(PI_BUNDLE_PATH) || expression.test("pi.js");
}

function globToRegExp(pattern: string): RegExp {
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          expression += "(?:.*/)?";
        } else {
          expression += ".*";
        }
      } else {
        expression += "[^/]*";
      }
      continue;
    }
    if (character === "?") {
      expression += "[^/]";
      continue;
    }
    expression += /[.+^${}()|[\]\\]/.test(character) ? `\\${character}` : character;
  }
  return new RegExp(`^${expression}$`);
}

function isExactPiBundlePath(path: string): boolean {
  return normalizeExactPackagePath(path) === PI_BUNDLE_PATH;
}

function normalizePackagePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function normalizeExactPackagePath(value: string): string {
  return normalizePackagePath(value).replace(/^\.\//, "");
}

function isCodexLimitsPackage(
  entry: PiPackageEntry,
  packageRoot: string,
  settingsPath: string,
  homeDirectory: string
): boolean {
  if (isNpmCodexLimitsPackage(entry)) {
    return true;
  }

  const source = typeof entry === "string" ? entry : entry.source;
  const configuredPath = resolveLocalPackagePath(source, settingsPath, homeDirectory);
  return configuredPath !== null && pathsEqual(configuredPath, packageRoot);
}

function isNpmCodexLimitsPackage(entry: PiPackageEntry): boolean {
  const source = typeof entry === "string" ? entry : entry.source;
  if (!source.startsWith("npm:")) {
    return false;
  }
  const npmSpec = source.slice("npm:".length).trim();
  return (
    npmSpec === PACKAGE_NAME ||
    (npmSpec.startsWith(`${PACKAGE_NAME}@`) && npmSpec.length > PACKAGE_NAME.length + 1)
  );
}

function resolveLocalPackagePath(
  source: string,
  settingsPath: string,
  homeDirectory: string
): string | null {
  if (source === "~" || hasTildePrefix(source)) {
    return resolveTildePath(source, homeDirectory);
  }
  if (/^(?:git|github|https?|npm|ssh):/i.test(source)) {
    return null;
  }
  if (source.startsWith("file://")) {
    try {
      return fileURLToPath(source);
    } catch {
      return null;
    }
  }
  if (isAbsolute(source)) {
    return normalize(source);
  }
  return resolve(dirname(settingsPath), source);
}

function pathsEqual(left: string, right: string): boolean {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
