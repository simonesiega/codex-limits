import {detectCodexHome} from "@/package/core/codex/paths";
import {readCodexSessions} from "@/package/core/codex/session-reader";
import {readCodexState} from "@/package/core/codex/state-reader";
import {getResetCoupons} from "@/package/core/coupons/reset-coupons";
import type {
  CodexLimitsOptions,
  CodexLimitsResult,
  LocalUsageResult,
  UsageResult,
} from "@/package/core/types";
import {getLiveUsage} from "@/package/core/usage/live";
import {
  mergeLocalUsage,
  parseUsageFromSessions,
  parseUsageFromState,
  unavailableLocalUsage,
  withUsageSource,
} from "@/package/core/usage/normalizer";
import {redactWarnings} from "@/package/core/utils/redact";

const LOCAL_USAGE_SOURCE = {kind: "local", label: "Local"} as const;

/** Returns normalized, redacted data shared by every product surface. */
export async function getCodexLimits(options: CodexLimitsOptions = {}): Promise<CodexLimitsResult> {
  const couponRequest =
    options.includeCoupons === false ? Promise.resolve(null) : getResetCoupons(options);
  const [usage, couponResult] = await Promise.all([getUsageLimits(options), couponRequest]);
  const coupons = couponResult
    ? {...couponResult, warnings: redactWarnings(couponResult.warnings)}
    : null;

  return {
    windows: usage.windows,
    usageSource: usage.source,
    coupons,
    warnings: redactWarnings([...usage.warnings, ...(coupons?.warnings ?? [])]),
  };
}

/** Prefers any recognized live usage and falls back locally only when no live window exists. */
export async function getUsageLimits(options: CodexLimitsOptions = {}): Promise<UsageResult> {
  const live = await getLiveUsage(options);
  if (live.status !== "unavailable") {
    return live;
  }

  const local = withUsageSource(await getLocalUsage(options), LOCAL_USAGE_SOURCE);
  return selectUsageResult(live, local);
}

/** Selects recognized live usage before a local fallback. */
export function selectUsageResult(live: UsageResult, local: UsageResult): UsageResult {
  if (live.status !== "unavailable") {
    return live;
  }
  if (local.status !== "unavailable") {
    return local;
  }
  return {...local, warnings: [...live.warnings, ...local.warnings]};
}

/** Reads and merges safe local session and state usage. */
export async function getLocalUsage(options: CodexLimitsOptions = {}): Promise<LocalUsageResult> {
  const now = options.now ?? new Date();
  const detection = await detectCodexHome(options);
  if (!detection.foundHome) {
    return unavailableLocalUsage(["No readable local Codex home directory was found."]);
  }

  const [sessions, state] = await Promise.all([
    readCodexSessions(detection.foundHome),
    readCodexState(detection.foundHome),
  ]);
  return mergeLocalUsage(parseUsageFromSessions(sessions, now), parseUsageFromState(state, now));
}
