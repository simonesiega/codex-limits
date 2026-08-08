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
export async function installOpencodeIntegration(
  options: OpencodeConfigOptions = {}
): Promise<AgentInstallResult> {
  const {configPath, tuiConfigPath} = resolveOpencodePaths(options);

  // OpenCode versions discover TUI plugins from different global config files, so keep both in sync.
  const [config, tuiConfig] = await Promise.all([
    readOpencodeConfig(configPath, "https://opencode.ai/config.json"),
    readOpencodeConfig(tuiConfigPath, "https://opencode.ai/tui.json"),
  ]);
  const configChanged = addPlugin(config.value);
  const tuiConfigChanged = addPlugin(tuiConfig.value);
  await writeOpencodeConfigs("install", [
    {...config, path: configPath, changed: configChanged},
    {...tuiConfig, path: tuiConfigPath, changed: tuiConfigChanged},
  ]);

  return {changed: configChanged || tuiConfigChanged, configPaths: [configPath, tuiConfigPath]};
}

/** Removes only recognized Codex Limits entries from OpenCode's plugin configurations. */
export async function uninstallOpencodeIntegration(
  options: OpencodeConfigOptions = {}
): Promise<AgentUninstallResult> {
  const {configPath, tuiConfigPath} = resolveOpencodePaths(options);
  const [config, tuiConfig] = await Promise.all([
    readOpencodeConfig(configPath, "https://opencode.ai/config.json", "uninstall"),
    readOpencodeConfig(tuiConfigPath, "https://opencode.ai/tui.json", "uninstall"),
  ]);
  const configChanged = removePlugin(config.value);
  const tuiConfigChanged = removePlugin(tuiConfig.value);
  await writeOpencodeConfigs("uninstall", [
    {...config, path: configPath, changed: configChanged},
    {...tuiConfig, path: tuiConfigPath, changed: tuiConfigChanged},
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

function addPlugin(config: Record<string, unknown>): boolean {
  const plugins = readPluginArray(config.plugin);
  if (plugins.some(isCodexLimitsPlugin)) {
    return false;
  }
  config.plugin = [...plugins, OPENCODE_PLUGIN_SPEC];
  return true;
}

function removePlugin(config: Record<string, unknown>): boolean {
  const plugins = readPluginArray(config.plugin, "uninstall");
  const remaining = plugins.filter((plugin) => !isCodexLimitsPlugin(plugin));
  if (remaining.length === plugins.length) {
    return false;
  }
  config.plugin = remaining;
  return true;
}

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

function isPluginEntry(value: unknown): value is OpencodePluginEntry {
  return (
    typeof value === "string" ||
    (Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      isRecord(value[1]))
  );
}

function isCodexLimitsPlugin(value: OpencodePluginEntry): boolean {
  // A pinned version or tag has the same package identity and must not be added a second time.
  const spec = Array.isArray(value) ? value[0] : value;
  return (
    spec === OPENCODE_PLUGIN_SPEC ||
    (spec.startsWith(`${OPENCODE_PLUGIN_SPEC}@`) && spec.length > OPENCODE_PLUGIN_SPEC.length + 1)
  );
}
