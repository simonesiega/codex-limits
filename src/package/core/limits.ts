import { detectCodexHome } from "./codex/paths";
import { readCodexSessions } from "./codex/session-reader";
import { readCodexState } from "./codex/state-reader";
import { getResetCoupons } from "./coupons/reset-coupons";
import type { CodexLimitsOptions, CodexLimitsResult, LocalUsageResult, UsageResult } from "./types";
import { getLiveUsage } from "./usage/live";
import { mergeLocalUsage, parseUsageFromSessions, parseUsageFromState, unavailableLocalUsage, withUsageSource } from "./usage/normalizer";
import { redactWarnings } from "./utils/redact";

const LOCAL_USAGE_SOURCE = { kind: "local", label: "Local" } as const;

/**
 * Reads local Codex state, optionally fetches reset coupons, and returns normalized dashboard data.
 *
 * @param options - Optional environment, filesystem, fetch, and clock overrides.
 * @returns Combined Codex limits result for commands, TUI, and future adapters.
 */
export async function getCodexLimits(options: CodexLimitsOptions = {}): Promise<CodexLimitsResult> {
  const usage = await getUsageLimits(options);
  const coupons = options.includeCoupons === false ? null : await getResetCoupons(options);
  const warnings = redactWarnings([...usage.warnings, ...(coupons?.warnings ?? [])]);

  return {
    windows: usage.windows,
    usageSource: usage.source,
    coupons,
    warnings,
  };
}

/**
 * Reads live usage when available, otherwise falls back to local Codex files.
 *
 * @param options - Optional environment, filesystem, fetch, and clock overrides.
 * @returns Selected usage data and its source.
 */
export async function getUsageLimits(options: CodexLimitsOptions = {}): Promise<UsageResult> {
  const live = await getLiveUsage(options);
  if (live.status === "available") {
    return live;
  }

  const local = withUsageSource(await getLocalUsage(options), LOCAL_USAGE_SOURCE);
  return local.status !== "unavailable" ? local : { ...local, warnings: [...live.warnings, ...local.warnings] };
}

/**
 * Reads local Codex files and returns normalized usage data.
 *
 * @param options - Optional filesystem and clock overrides.
 * @returns Normalized local usage data.
 */
export async function getLocalUsage(options: CodexLimitsOptions = {}): Promise<LocalUsageResult> {
  const now = options.now ?? new Date();
  const detection = await detectCodexHome(options);

  if (!detection.foundHome) {
    return unavailableLocalUsage(["No readable local Codex home directory was found."]);
  }

  const sessions = await readCodexSessions(detection.foundHome);
  const sessionUsage = parseUsageFromSessions(sessions, now);
  const state = await readCodexState(detection.foundHome);
  const stateUsage = parseUsageFromState(state, now);

  return mergeLocalUsage(sessionUsage, stateUsage);
}
