import {homedir} from "node:os";
import {join} from "node:path";
import {writeAgentJsonAtomically} from "@/agents/shared/json-config";
import {
  AgentInstallError,
  type AgentInstallResult,
  type AgentIntegrationStatus,
} from "@/agents/types";
import {BoundedFileError, readBoundedUtf8File} from "@/package/core/utils/bounded-file";
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
  const configDirectory = join(homedir(), ".config", "opencode");
  const configPath = options.configPath ?? join(configDirectory, "opencode.json");
  const tuiConfigPath = options.tuiConfigPath ?? join(configDirectory, "tui.json");

  // OpenCode versions discover TUI plugins from different global config files, so keep both in sync.
  const [config, tuiConfig] = await Promise.all([
    readOpencodeConfig(configPath, "https://opencode.ai/config.json"),
    readOpencodeConfig(tuiConfigPath, "https://opencode.ai/tui.json"),
  ]);
  const configChanged = addPlugin(config);
  const tuiConfigChanged = addPlugin(tuiConfig);

  try {
    if (configChanged) {
      await writeAgentJsonAtomically(configPath, config);
    }
    if (tuiConfigChanged) {
      await writeAgentJsonAtomically(tuiConfigPath, tuiConfig);
    }
  } catch {
    throw new AgentInstallError("Could not safely update the OpenCode configuration.");
  }

  return {changed: configChanged || tuiConfigChanged, configPaths: [configPath, tuiConfigPath]};
}

/** Checks bounded OpenCode configurations without returning their contents or paths. */
export async function inspectOpencodeIntegration(
  options: OpencodeConfigOptions = {}
): Promise<AgentIntegrationStatus> {
  const configDirectory = join(homedir(), ".config", "opencode");
  const configPath = options.configPath ?? join(configDirectory, "opencode.json");
  const tuiConfigPath = options.tuiConfigPath ?? join(configDirectory, "tui.json");
  const statuses = await Promise.all([
    inspectOpencodeConfig(configPath, "https://opencode.ai/config.json"),
    inspectOpencodeConfig(tuiConfigPath, "https://opencode.ai/tui.json"),
  ]);

  if (statuses.includes("installed")) {
    return "installed";
  }
  return statuses.every((status) => status === "not-installed") ? "not-installed" : "unknown";
}

async function inspectOpencodeConfig(
  path: string,
  schema: string
): Promise<AgentIntegrationStatus> {
  try {
    const config = await readOpencodeConfig(path, schema);
    return readPluginArray(config.plugin).some(isCodexLimitsPlugin) ? "installed" : "not-installed";
  } catch {
    return "unknown";
  }
}

async function readOpencodeConfig(path: string, schema: string): Promise<Record<string, unknown>> {
  let content: string;
  try {
    content = await readBoundedUtf8File(path, MAX_CONFIG_BYTES);
  } catch (error) {
    if (error instanceof BoundedFileError) {
      if (error.code === "not-found") {
        return {$schema: schema};
      }
      if (error.code === "too-large") {
        throw new AgentInstallError("OpenCode configuration is too large to update safely.");
      }
    }
    throw new AgentInstallError("Could not safely read the OpenCode configuration.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new AgentInstallError("opencode config must contain valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new AgentInstallError("opencode config must be a JSON object.");
  }
  return {$schema: schema, ...parsed};
}

function addPlugin(config: Record<string, unknown>): boolean {
  const plugins = readPluginArray(config.plugin);
  if (plugins.some(isCodexLimitsPlugin)) {
    return false;
  }
  config.plugin = [...plugins, OPENCODE_PLUGIN_SPEC];
  return true;
}

function readPluginArray(value: unknown): OpencodePluginEntry[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every(isPluginEntry)) {
    throw new AgentInstallError("opencode config field `plugin` must be an array.");
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
  return spec === OPENCODE_PLUGIN_SPEC || spec.startsWith(`${OPENCODE_PLUGIN_SPEC}@`);
}
