/**
 * @fileoverview Shared core logic for env. This module is part of the canonical data, normalization, or safety layer reused by commands, the TUI, and agent adapters.
 */
import type {EnvironmentMap} from "@/package/core/types";

/** Reads a non-empty trimmed environment value without mutating the supplied map. */
export function readEnvValue(env: EnvironmentMap, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

/** Uses an injected environment for deterministic callers, otherwise the current process environment. */
export function resolveEnvironment(env?: EnvironmentMap): EnvironmentMap {
  return env ?? process.env;
}
