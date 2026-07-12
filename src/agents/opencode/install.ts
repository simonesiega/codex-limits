import {randomUUID} from "node:crypto";
import {mkdir, rename, rm, writeFile} from "node:fs/promises";
import {homedir} from "node:os";
import {dirname, join} from "node:path";
import {BoundedFileError, readBoundedUtf8File} from "../../package/core/utils/bounded-file";
import {isRecord} from "../../package/core/utils/unknown";
import {AgentInstallError, type AgentInstallResult} from "../types";

// The OpenCode plugin specification for the Codex Limits agent.
export const OPENCODE_PLUGIN_SPEC = "@simonesiega/codex-limits";

// The maximum size of the OpenCode configuration files that can be safely read and updated.
const MAX_CONFIG_BYTES = 1_000_000;

/**
 * Store the structure of an OpenCode plugin entry.
 */
type OpencodePluginEntry = string | [string, Record<string, unknown>];

/**
 * Options for installing the Codex Limits agent in OpenCode configuration files.
 */
export interface OpencodeInstallOptions {
  // Global opencode config path override used by tests.
  configPath?: string;

  // Global opencode TUI config path override used by tests.
  tuiConfigPath?: string;
}

/**
 * Store the result of installing the Codex Limits agent in OpenCode configuration files.
 */
export type OpencodeInstallResult = AgentInstallResult & {configPaths: string[]};

/**
 * Installs the Codex Limits agent in the OpenCode configuration files.
 * @param options - Options for installing the Codex Limits agent.
 * @returns - The result of the installation, including whether the configuration files were changed and their paths.
 */
export async function installOpencodePlugin(
  options: OpencodeInstallOptions = {}
): Promise<OpencodeInstallResult> {
  // Determine the paths to the OpenCode configuration files, using the provided options or the default global paths.
  const configPath = options.configPath ?? getGlobalOpencodeConfigPath();

  // Determine the path to the OpenCode TUI configuration file, using the provided options or the default global path.
  const tuiConfigPath = options.tuiConfigPath ?? getGlobalOpencodeTuiConfigPath();

  const [config, tuiConfig] = await Promise.all([
    readOpencodeConfig(configPath, "https://opencode.ai/config.json"),
    readOpencodeConfig(tuiConfigPath, "https://opencode.ai/tui.json"),
  ]);
  const plugin = normalizePluginArray(config.plugin);
  const tuiPlugin = normalizePluginArray(tuiConfig.plugin);
  const configChanged = !plugin.some(isCodexLimitsPlugin);
  const tuiConfigChanged = !tuiPlugin.some(isCodexLimitsPlugin);

  if (configChanged) {
    config.plugin = [...plugin, OPENCODE_PLUGIN_SPEC];
  }
  if (tuiConfigChanged) {
    tuiConfig.plugin = [...tuiPlugin, OPENCODE_PLUGIN_SPEC];
  }

  try {
    if (configChanged) {
      await writeJsonAtomically(configPath, config);
    }
    if (tuiConfigChanged) {
      await writeJsonAtomically(tuiConfigPath, tuiConfig);
    }
  } catch {
    throw new AgentInstallError(
      "opencode.config.write-failed",
      "Could not safely update the OpenCode configuration."
    );
  }

  // Return the result of the installation, including whether the configuration files were changed and their paths.
  return {changed: configChanged || tuiConfigChanged, configPaths: [configPath, tuiConfigPath]};
}

/**
 * Returns the documented global OpenCode configuration path.
 * @returns - The path to the global OpenCode configuration file.
 */
export function getGlobalOpencodeConfigPath(): string {
  return join(homedir(), ".config", "opencode", "opencode.json");
}

/**
 * Returns the documented global OpenCode TUI configuration path.
 * @returns - The path to the global OpenCode TUI configuration file.
 */
export function getGlobalOpencodeTuiConfigPath(): string {
  return join(homedir(), ".config", "opencode", "tui.json");
}

/**
 * Reads the OpenCode configuration file at the specified path and returns its contents as a JSON object.
 * @param configPath - The path to the OpenCode configuration file.
 * @param schema - The schema URL to include in the returned configuration object.
 * @returns - A promise that resolves to the contents of the OpenCode configuration file as a JSON object,
 * or an empty object with the specified schema if the file does not exist.
 */
async function readOpencodeConfig(
  configPath: string,
  schema: string
): Promise<Record<string, unknown>> {
  let content: string;

  // Attempt to read the OpenCode configuration file, handling errors related to file size and existence.
  try {
    content = await readBoundedUtf8File(configPath, MAX_CONFIG_BYTES);
  } catch (error) {
    if (error instanceof BoundedFileError && error.code === "not-found") {
      return {$schema: schema};
    }
    throw new AgentInstallError(
      error instanceof BoundedFileError && error.code === "too-large"
        ? "opencode.config.too-large"
        : "opencode.config.read-failed",
      error instanceof BoundedFileError && error.code === "too-large"
        ? "OpenCode configuration is too large to update safely."
        : "Could not safely read the OpenCode configuration."
    );
  }

  // Attempt to parse the contents of the OpenCode configuration file as JSON, handling errors related to invalid JSON and non-object structures.
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) {
      throw new AgentInstallError(
        "opencode.config.not-object",
        "opencode config must be a JSON object."
      );
    }
    return {$schema: schema, ...parsed};
  } catch (error) {
    if (error instanceof AgentInstallError) {
      throw error;
    }
    throw new AgentInstallError(
      "opencode.config.invalid-json",
      "opencode config must contain valid JSON."
    );
  }
}

/**
 * Normalizes the `plugin` field of the OpenCode configuration, ensuring it is an array of valid plugin entries.
 * @param value - The value of the `plugin` field to normalize.
 * @returns - An array of valid OpenCode plugin entries.
 */
function normalizePluginArray(value: unknown): OpencodePluginEntry[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every(isPluginEntry)) {
    throw new AgentInstallError(
      "opencode.config.invalid-plugin",
      "opencode config field `plugin` must be an array."
    );
  }
  return value;
}

/**
 * Check if the given value is a valid OpenCode plugin entry, which can be either a string or a tuple of a string and an object.
 * @param value - The value to check.
 * @returns - True if the value is a valid OpenCode plugin entry, false otherwise.
 */
function isPluginEntry(value: unknown): value is OpencodePluginEntry {
  return (
    typeof value === "string" ||
    (Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      isRecord(value[1]))
  );
}

/**
 * Check if the given value is the Codex Limits plugin entry in the OpenCode configuration.
 * @param value - The value to check.
 * @returns - True if the value is the Codex Limits plugin entry, false otherwise.
 */
function isCodexLimitsPlugin(value: OpencodePluginEntry): boolean {
  return Array.isArray(value) ? value[0] === OPENCODE_PLUGIN_SPEC : value === OPENCODE_PLUGIN_SPEC;
}

/**
 * Writes a JSON object to a file atomically, ensuring that the file is either fully written or not modified at all.
 * @param path - The path to the file where the JSON object should be written.
 * @param value - The JSON object to write to the file.
 */
async function writeJsonAtomically(path: string, value: Record<string, unknown>): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = join(directory, `.codex-limits-${randomUUID()}.tmp`);
  await mkdir(directory, {recursive: true});

  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, {force: true}).catch(() => undefined);
  }
}
