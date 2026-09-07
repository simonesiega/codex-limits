/**
 * @fileoverview CLI command-layer support for usage threshold. It translates validated command input and shared core results into stable terminal or JSON behavior.
 */
import type {
  CommandValidationIssue,
  OptionDefinition,
  ParsedCommandValues,
} from "@/package/commands/command";
import type {UsageWindows} from "@/package/core/types";
import {
  evaluateUsageThresholds,
  type UsageThreshold,
  type UsageThresholdWindow,
} from "@/package/core/usage/threshold";

const THRESHOLD_OPTION_KEY = "usage.threshold";
const THRESHOLD_PATTERN = /^(five-hour|weekly)=(\d+(?:\.\d+)?)$/;

const USAGE_THRESHOLD_EXIT_CODES = {
  satisfied: 0,
  breached: 2,
  unavailable: 3,
} as const;

/** Shared threshold option for usage commands. */
export const USAGE_THRESHOLD_OPTION: OptionDefinition = {
  key: THRESHOLD_OPTION_KEY,
  long: "--threshold",
  description: "Require remaining usage as <five-hour|weekly>=<percent>",
  kind: "value",
  valueName: "condition",
  repeatable: true,
};

/** Validates the shared usage-threshold grammar and rejects duplicate windows. */
export function validateUsageThresholds(
  values: ParsedCommandValues
): CommandValidationIssue | null {
  return parseUsageThresholds(values).issue;
}

/** Returns the documented exit code for all configured usage thresholds. */
export function getUsageThresholdExitCode(
  windows: UsageWindows,
  values: ParsedCommandValues
): number {
  const thresholds = parseUsageThresholds(values).thresholds;
  return USAGE_THRESHOLD_EXIT_CODES[evaluateUsageThresholds(windows, thresholds)];
}

/** Parses all repeated threshold expressions before any usage data is loaded. */
function parseUsageThresholds(values: ParsedCommandValues): {
  thresholds: UsageThreshold[];
  issue: CommandValidationIssue | null;
} {
  const optionValue = values.options[THRESHOLD_OPTION_KEY];
  const rawThresholds = Array.isArray(optionValue) ? optionValue : [];
  const thresholds: UsageThreshold[] = [];
  const selectedWindows = new Set<UsageThresholdWindow>();

  for (const rawThreshold of rawThresholds) {
    const match = THRESHOLD_PATTERN.exec(rawThreshold);
    const window = toWindow(match?.[1]);
    const minimumRemainingPercent = Number(match?.[2]);
    if (!window || !Number.isFinite(minimumRemainingPercent) || minimumRemainingPercent > 100) {
      return {
        thresholds: [],
        issue: {
          code: "invalid-option-value",
          message:
            "Invalid --threshold value. Expected five-hour=<percent> or weekly=<percent>, from 0 to 100.",
        },
      };
    }
    if (selectedWindows.has(window)) {
      return {
        thresholds: [],
        issue: {
          code: "invalid-option-value",
          message: "Each usage window may be specified by --threshold only once.",
        },
      };
    }

    selectedWindows.add(window);
    thresholds.push({window, minimumRemainingPercent});
  }

  return {thresholds, issue: null};
}

/** Maps public threshold names to stable normalized usage-window keys. */
function toWindow(value: string | undefined): UsageThresholdWindow | null {
  if (value === "five-hour") {
    return "fiveHour";
  }
  if (value === "weekly") {
    return "weekly";
  }
  return null;
}
