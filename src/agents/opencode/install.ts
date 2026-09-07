/**
 * @fileoverview Agent adapter support for install. The adapter stays thin, delegates Codex data handling to the shared core, and preserves the host integration safety boundary.
 */
import {homedir} from "node:os";
import {join} from "node:path";
import {
  readAgentJsonObject,
  writeAgentJsonFilesAtomically,
  type AgentJsonDocument,
  type AgentJsonUpdate,
} from "@/agents/shared/json-config";
import {createAgentOperationError, type AgentOperation} from "@/agents/shared/operation";
import {
  type AgentInstallResult,
  type AgentIntegrationStatus,
  type AgentLifecycleResult,
  type AgentUninstallResult,
} from "@/agents/types";
import {isRecord} from "@/package/core/utils/unknown";

const OPENCODE_PLUGIN_SPEC = "@simonesiega/codex-limits";
const MAX_CONFIG_BYTES = 1_000_000;

type OpencodePluginEntry = string | [string, Record<string, unknown>];

interface OpencodeConfigOptions {
  configPath?: string;
  tuiConfigPath?: string;
}

/** Adds the Codex Limits package to OpenCode's global plugin configurations. */
export function installOpencodeIntegration(
  options: OpencodeConfigOptions = {}
): Promise<AgentInstallResult> {
  return updateOpencodeIntegration("install", options, addPlugin);
}

/** Removes only recognized Codex Limits entries from OpenCode's plugin configurations. */
export function uninstallOpencodeIntegration(
  options: OpencodeConfigOptions = {}
): Promise<AgentUninstallResult> {
  return updateOpencodeIntegration("uninstall", options, removePlugin);
}

// Keep both host configuration files on one update path so install and uninstall cannot drift.
/** Reads every target before mutation so malformed sibling configuration prevents partial writes. */
async function updateOpencodeIntegration(
  operation: AgentOperation,
  options: OpencodeConfigOptions,
  updatePlugin: (config: Record<string, unknown>) => boolean
): Promise<AgentLifecycleResult> {
  const {configPath, tuiConfigPath} = resolveOpencodePaths(options);

  // OpenCode versions discover TUI plugins from different global config files, so keep both in sync.
  const [config, tuiConfig] = await Promise.all([
    readOpencodeConfig(configPath, "https://opencode.ai/config.json", operation),
    readOpencodeConfig(tuiConfigPath, "https://opencode.ai/tui.json", operation),
  ]);
  const configChanged = updatePlugin(config.value);
  const tuiConfigChanged = updatePlugin(tuiConfig.value);
  await writeOpencodeConfigs(operation, [
    {...config, path: configPath, maxBytes: MAX_CONFIG_BYTES, changed: configChanged},
    {...tuiConfig, path: tuiConfigPath, maxBytes: MAX_CONFIG_BYTES, changed: tuiConfigChanged},
  ]);

  return {changed: configChanged || tuiConfigChanged, configPaths: [configPath, tuiConfigPath]};
}

/** Checks bounded OpenCode configurations without returning their contents or paths. */
export async function inspectOpencodeIntegration(
  options: OpencodeConfigOptions = {}
): Promise<AgentIntegrationStatus> {
  const {configPath, tuiConfigPath} = resolveOpencodePaths(options);
  const statuses = await Promise.all([
    inspectOpencodeConfig(configPath, "https://opencode.ai/config.json"),
    inspectOpencodeConfig(tuiConfigPath, "https://opencode.ai/tui.json"),
  ]);

  if (statuses.includes("installed")) {
    return "installed";
  }
  return statuses.every((status) => status === "not-installed") ? "not-installed" : "unknown";
}

/** Resolves explicit test paths or the two supported global OpenCode configuration locations. */
function resolveOpencodePaths(options: OpencodeConfigOptions): {
  configPath: string;
  tuiConfigPath: string;
} {
  const configDirectory = join(homedir(), ".config", "opencode");
  return {
    configPath: options.configPath ?? join(configDirectory, "opencode.json"),
    tuiConfigPath: options.tuiConfigPath ?? join(configDirectory, "tui.json"),
  };
}

/** Classifies one configuration without modifying missing or malformed files. */
async function inspectOpencodeConfig(
  path: string,
  schema: string
): Promise<AgentIntegrationStatus> {
  try {
    const config = await readOpencodeConfig(path, schema);
    return readPluginArray(config.value.plugin).some(isCodexLimitsPlugin)
      ? "installed"
      : "not-installed";
  } catch {
    return "unknown";
  }
}

/** Maps bounded JSON read failures to operation-specific safe adapter errors. */
async function readOpencodeConfig(
  path: string,
  schema: string,
  operation: AgentOperation = "install"
): Promise<AgentJsonDocument> {
  const document = await readAgentJsonObject(path, {
    maxBytes: MAX_CONFIG_BYTES,
    operation,
    messages: {
      tooLarge: "OpenCode configuration is too large to update safely.",
      read: "Could not safely read the OpenCode configuration.",
      invalidJson: "opencode config must contain valid JSON.",
      notObject: "opencode config must be a JSON object.",
    },
  });
  return operation === "install"
    ? {...document, value: {$schema: schema, ...document.value}}
    : document;
}

/** Batches changed documents so validation occurs before the first replacement. */
async function writeOpencodeConfigs(
  operation: AgentOperation,
  configs: ReadonlyArray<AgentJsonUpdate & {changed: boolean}>
): Promise<void> {
  const updates = configs.filter((config) => config.changed);
  if (updates.length === 0) {
    return;
  }

  try {
    await writeAgentJsonFilesAtomically(updates);
  } catch {
    throw createAgentOperationError(
      operation,
      "Could not safely update the OpenCode configuration."
    );
  }
}

/** Adds the package registration only when no recognized entry already exists. */
function addPlugin(config: Record<string, unknown>): boolean {
  const plugins = readPluginArray(config.plugin);
  if (plugins.some(isCodexLimitsPlugin)) {
    return false;
  }
  config.plugin = [...plugins, OPENCODE_PLUGIN_SPEC];
  return true;
}

/** Removes recognized package registrations while preserving every unrelated plugin. */
function removePlugin(config: Record<string, unknown>): boolean {
  const plugins = readPluginArray(config.plugin, "uninstall");
  const remaining = plugins.filter((plugin) => !isCodexLimitsPlugin(plugin));
  if (remaining.length === plugins.length) {
    return false;
  }
  config.plugin = remaining;
  return true;
}

/** Treats a missing plugin list as empty but rejects malformed list entries. */
function readPluginArray(
  value: unknown,
  operation: AgentOperation = "install"
): OpencodePluginEntry[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every(isPluginEntry)) {
    throw createAgentOperationError(operation, "opencode config field `plugin` must be an array.");
  }
  return value;
}

/** Narrows supported string and tuple registration forms. */
function isPluginEntry(value: unknown): value is OpencodePluginEntry {
  return (
    typeof value === "string" ||
    (Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      isRecord(value[1]))
  );
}

/** Recognizes package registrations with optional npm version suffixes. */
function isCodexLimitsPlugin(value: OpencodePluginEntry): boolean {
  // A pinned version or tag has the same package identity and must not be added a second time.
  const spec = Array.isArray(value) ? value[0] : value;
  return (
    spec === OPENCODE_PLUGIN_SPEC ||
    (spec.startsWith(`${OPENCODE_PLUGIN_SPEC}@`) && spec.length > OPENCODE_PLUGIN_SPEC.length + 1)
  );
}
