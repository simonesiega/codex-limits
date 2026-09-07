/**
 * @fileoverview Shared core logic for threshold. This module is part of the canonical data, normalization, or safety layer reused by commands, the TUI, and agent adapters.
 */
import type {UsageWindows} from "@/package/core/types";

/** Stable identifiers accepted by usage-threshold automation. */
export type UsageThresholdWindow = "fiveHour" | "weekly";

/** Minimum remaining capacity required for one normalized usage window. */
export interface UsageThreshold {
  window: UsageThresholdWindow;
  minimumRemainingPercent: number;
}

/** Result used to select a deterministic process exit code. */
export type UsageThresholdStatus = "satisfied" | "breached" | "unavailable";

/** Evaluates minimum remaining-capacity thresholds against normalized usage data. */
export function evaluateUsageThresholds(
  windows: UsageWindows,
  thresholds: readonly UsageThreshold[]
): UsageThresholdStatus {
  let breached = false;

  for (const {window, minimumRemainingPercent} of thresholds) {
    const remainingPercent = windows[window]?.remainingPercent;
    if (remainingPercent === null || remainingPercent === undefined) {
      return "unavailable";
    }
    if (remainingPercent < minimumRemainingPercent) {
      breached = true;
    }
  }

  return breached ? "breached" : "satisfied";
}
