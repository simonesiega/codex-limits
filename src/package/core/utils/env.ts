import type {EnvironmentMap} from "@/package/core/types";

export function readEnvValue(env: EnvironmentMap, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

export function resolveEnvironment(env?: EnvironmentMap): EnvironmentMap {
  return env ?? process.env;
}
