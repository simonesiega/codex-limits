import {lstat, stat} from "node:fs/promises";
import {homedir} from "node:os";
import {dirname, isAbsolute, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  readAgentJsonObject,
  writeAgentJsonAtomically,
  type AgentJsonDocument,
} from "@/agents/shared/json-config";
import {createAgentOperationError, type AgentOperation} from "@/agents/shared/operation";
import {hasTildePrefix, resolvePackageRoot, resolveTildePath} from "@/agents/shared/paths";
import {
  AgentInstallError,
  type AgentInstallResult,
  type AgentIntegrationStatus,
  type AgentUninstallResult,
} from "@/agents/types";
import {readBoundedUtf8File} from "@/package/core/utils/bounded-file";
import type {EnvironmentMap} from "@/package/core/types";
import {readEnvValue} from "@/package/core/utils/env";
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
  const document = await readPiSettings(paths.settingsPath);
  const packages = readPackageEntries(document.value.packages);
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
    document.value.packages = packages;
    try {
      await writeAgentJsonAtomically(paths.settingsPath, document.value, document.source);
    } catch {
      throw new AgentInstallError("Could not safely update the pi settings.");
    }
  }

  return {changed, configPaths: [paths.settingsPath]};
}

/** Removes only recognized Codex Limits package registrations from pi's global settings. */
export async function uninstallPiIntegration(
  options: PiConfigOptions = {}
): Promise<AgentUninstallResult> {
  const paths = resolvePiPaths(options);
  const document = await readPiSettings(paths.settingsPath, "uninstall");
  const packages = readPackageEntries(document.value.packages, "uninstall");
  const remaining = packages.filter(
    (entry) =>
      !isCodexLimitsPackage(entry, paths.packageRoot, paths.settingsPath, paths.homeDirectory)
  );
  const changed = remaining.length !== packages.length;

  if (changed) {
    document.value.packages = remaining;
    try {
      await writeAgentJsonAtomically(paths.settingsPath, document.value, document.source);
    } catch {
      throw createAgentOperationError("uninstall", "Could not safely update the pi settings.");
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
    const document = await readPiSettings(paths.settingsPath);
    const packages = readPackageEntries(document.value.packages);
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
  const configuredDirectory = options.agentDirectory ?? readEnvValue(env, "PI_CODING_AGENT_DIR");
  const agentDirectory = configuredDirectory
    ? resolveTildePath(configuredDirectory, homeDirectory)
    : join(homeDirectory, ".pi", "agent");

  return {
    settingsPath: resolve(options.settingsPath ?? join(agentDirectory, "settings.json")),
    packageRoot: resolve(options.packageRoot ?? resolvePackageRoot()),
    homeDirectory,
  };
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

function readPiSettings(
  path: string,
  operation: AgentOperation = "install"
): Promise<AgentJsonDocument> {
  return readAgentJsonObject(path, {
    maxBytes: MAX_SETTINGS_BYTES,
    operation,
    messages: {
      tooLarge: "Pi settings are too large to update safely.",
      read: "Could not safely read the pi settings.",
      invalidJson: "pi settings must contain valid JSON.",
      notObject: "pi settings must be a JSON object.",
    },
  });
}

function readPackageEntries(
  value: unknown,
  operation: AgentOperation = "install"
): PiPackageEntry[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every(isPackageEntry)) {
    throw createAgentOperationError(
      operation,
      "pi settings field `packages` must contain package sources."
    );
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
  if (/[[\]{}()]/.test(normalizedPattern)) {
    return null;
  }
  return (
    matchesGlobPattern(PI_BUNDLE_PATH, normalizedPattern) ||
    matchesGlobPattern("pi.js", normalizedPattern)
  );
}

// Memoized matching avoids regex backtracking on untrusted package-filter patterns.
function matchesGlobPattern(value: string, pattern: string): boolean {
  const memo = new Map<number, boolean>();
  const valueStates = value.length + 1;

  const match = (patternIndex: number, valueIndex: number): boolean => {
    const key = patternIndex * valueStates + valueIndex;
    const cached = memo.get(key);
    if (cached !== undefined) {
      return cached;
    }

    let result: boolean;
    const character = pattern[patternIndex];
    if (character === undefined) {
      result = valueIndex === value.length;
    } else if (character === "*") {
      let starEnd = patternIndex + 1;
      while (pattern[starEnd] === "*") {
        starEnd += 1;
      }

      const globstar = starEnd - patternIndex > 1;
      if (globstar && pattern[starEnd] === "/") {
        result = match(starEnd + 1, valueIndex);
        for (let index = valueIndex; !result && index < value.length; index += 1) {
          if (value[index] === "/") {
            result = match(starEnd + 1, index + 1);
          }
        }
      } else {
        result = match(starEnd, valueIndex);
        for (let index = valueIndex; !result && index < value.length; index += 1) {
          if (!globstar && value[index] === "/") {
            break;
          }
          result = match(starEnd, index + 1);
        }
      }
    } else if (character === "?") {
      result =
        valueIndex < value.length &&
        value[valueIndex] !== "/" &&
        match(patternIndex + 1, valueIndex + 1);
    } else {
      result = character === value[valueIndex] && match(patternIndex + 1, valueIndex + 1);
    }

    memo.set(key, result);
    return result;
  };

  return match(0, 0);
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
