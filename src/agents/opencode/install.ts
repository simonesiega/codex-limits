import {randomUUID} from "node:crypto";
import {mkdir, rename, rm, writeFile} from "node:fs/promises";
import {homedir} from "node:os";
import {dirname, join} from "node:path";
import {AgentInstallError} from "@/agents/types";
import {BoundedFileError, readBoundedUtf8File} from "@/package/core/utils/bounded-file";
import {isRecord} from "@/package/core/utils/unknown";

const OPENCODE_PLUGIN_SPEC = "@simonesiega/codex-limits";
const MAX_CONFIG_BYTES = 1_000_000;

type OpencodePluginEntry = string | [string, Record<string, unknown>];

/** Adds the Codex Limits package to OpenCode's global plugin configurations. */
export async function installOpencodePlugin(
  options: {configPath?: string; tuiConfigPath?: string} = {}
): Promise<{changed: boolean; configPaths: string[]}> {
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
      await writeJsonAtomically(configPath, config);
    }
    if (tuiConfigChanged) {
      await writeJsonAtomically(tuiConfigPath, tuiConfig);
    }
  } catch {
    throw new AgentInstallError("Could not safely update the OpenCode configuration.");
  }

  return {changed: configChanged || tuiConfigChanged, configPaths: [configPath, tuiConfigPath]};
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

async function writeJsonAtomically(path: string, value: Record<string, unknown>): Promise<void> {
  const directory = dirname(path);
  // A sibling temporary file keeps the final rename on one filesystem and prevents partial JSON writes.
  const temporaryPath = join(directory, `.codex-limits-${randomUUID()}.tmp`);
  await mkdir(directory, {recursive: true});

  try {
    // OpenCode configs may contain private values, so create the replacement owner-only.
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, {force: true}).catch(() => undefined);
  }
}
