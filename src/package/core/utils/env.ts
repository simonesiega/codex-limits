import type {EnvironmentMap} from "../types";

/**
 * Reads a non-empty environment variable value.
 *
 * @param env - Environment object to read from.
 * @param key - Variable name to inspect.
 * @returns Trimmed value when set, otherwise null.
 */
export function readEnvValue(env: EnvironmentMap, key: string): string | null {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * Resolves the environment object used by core modules.
 *
 * @param env - Optional environment override.
 * @returns Provided environment values or process.env.
 */
export function resolveEnvironment(env?: EnvironmentMap): EnvironmentMap {
  return env ?? process.env;
}
