import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const OPENCODE_PLUGIN_SPEC = "codex-limits";

export interface OpencodeInstallOptions {
  /** Global opencode config path override used by tests. */
  configPath?: string;
  /** Global opencode TUI config path override used by tests. */
  tuiConfigPath?: string;
}

export interface OpencodeInstallResult {
  /** Whether any config file was changed. */
  changed: boolean;
  /** Config paths that were inspected or written. */
  configPaths: string[];
}

/**
 * Installs the codex-limits opencode plugin in the user's global opencode config.
 *
 * @param options - Optional config path override.
 * @returns Install result with changed state and target path.
 */
export async function installOpencodePlugin(options: OpencodeInstallOptions = {}): Promise<OpencodeInstallResult> {
  const configPath = options.configPath ?? getGlobalOpencodeConfigPath();
  const tuiConfigPath = options.tuiConfigPath ?? getGlobalOpencodeTuiConfigPath();
  const config = await readOpencodeConfig(configPath);
  const tuiConfig = await readOpencodeConfig(tuiConfigPath, "https://opencode.ai/tui.json");
  const plugin = normalizePluginArray(config.plugin);
  const tuiPlugin = normalizePluginArray(tuiConfig.plugin);
  const configChanged = !plugin.some(isCodexLimitsPlugin);
  const tuiConfigChanged = !tuiPlugin.some(isCodexLimitsPlugin);

  if (configChanged) {
    config.plugin = [...plugin, OPENCODE_PLUGIN_SPEC];
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  if (tuiConfigChanged) {
    tuiConfig.plugin = [...tuiPlugin, OPENCODE_PLUGIN_SPEC];
    await mkdir(dirname(tuiConfigPath), { recursive: true });
    await writeFile(tuiConfigPath, `${JSON.stringify(tuiConfig, null, 2)}\n`, "utf8");
  }

  return { changed: configChanged || tuiConfigChanged, configPaths: [configPath, tuiConfigPath] };
}

/**
 * Returns the documented global opencode config path.
 *
 * @returns Global opencode config path.
 */
export function getGlobalOpencodeConfigPath(): string {
  return join(homedir(), ".config", "opencode", "opencode.json");
}

/**
 * Returns the documented global opencode TUI config path.
 *
 * @returns Global opencode TUI config path.
 */
export function getGlobalOpencodeTuiConfigPath(): string {
  return join(homedir(), ".config", "opencode", "tui.json");
}

async function readOpencodeConfig(configPath: string, schema = "https://opencode.ai/config.json"): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("opencode config must be a JSON object.");
    }

    return { $schema: schema, ...parsed };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { $schema: schema };
    }

    throw error;
  }
}

function normalizePluginArray(value: unknown): Array<string | [string, Record<string, unknown>]> {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("opencode config field `plugin` must be an array.");
  }

  return value as Array<string | [string, Record<string, unknown>]>;
}

function isCodexLimitsPlugin(value: string | [string, Record<string, unknown>]): boolean {
  return Array.isArray(value) ? value[0] === OPENCODE_PLUGIN_SPEC : value === OPENCODE_PLUGIN_SPEC;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
