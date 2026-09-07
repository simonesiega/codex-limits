/**
 * @fileoverview Behavioral coverage for usage threshold. The cases document the supported contract and isolate filesystem, network, or host state where applicable.
 */
import {expect, test} from "bun:test";
import type {UsageWindows} from "@/package/core/types";
import {evaluateUsageThresholds, type UsageThreshold} from "@/package/core/usage/threshold";

const windows: UsageWindows = {
  fiveHour: {
    label: "5-hour usage limit",
    remainingPercent: 20,
    usedPercent: 80,
    resetsAt: null,
    resetsIn: null,
  },
  weekly: {
    label: "Weekly usage limit",
    remainingPercent: 40,
    usedPercent: 60,
    resetsAt: null,
    resetsIn: null,
  },
};

test("usage thresholds handle boundary, breach, and unavailable values", () => {
  const cases: Array<{
    name: string;
    selectedWindows: UsageWindows;
    thresholds: UsageThreshold[];
    expected: ReturnType<typeof evaluateUsageThresholds>;
  }> = [
    {
      name: "no thresholds preserves success",
      selectedWindows: windows,
      thresholds: [],
      expected: "satisfied",
    },
    {
      name: "zero boundary is satisfied",
      selectedWindows: windows,
      thresholds: [{window: "fiveHour", minimumRemainingPercent: 0}],
      expected: "satisfied",
    },
    {
      name: "equal boundary is satisfied",
      selectedWindows: windows,
      thresholds: [{window: "fiveHour", minimumRemainingPercent: 20}],
      expected: "satisfied",
    },
    {
      name: "hundred boundary is satisfied",
      selectedWindows: {
        ...windows,
        fiveHour: {...windows.fiveHour!, remainingPercent: 100},
      },
      thresholds: [{window: "fiveHour", minimumRemainingPercent: 100}],
      expected: "satisfied",
    },
    {
      name: "value below minimum is breached",
      selectedWindows: windows,
      thresholds: [{window: "fiveHour", minimumRemainingPercent: 20.1}],
      expected: "breached",
    },
    {
      name: "all configured windows are evaluated",
      selectedWindows: windows,
      thresholds: [
        {window: "fiveHour", minimumRemainingPercent: 10},
        {window: "weekly", minimumRemainingPercent: 50},
      ],
      expected: "breached",
    },
    {
      name: "missing window is unavailable",
      selectedWindows: {...windows, weekly: null},
      thresholds: [{window: "weekly", minimumRemainingPercent: 0}],
      expected: "unavailable",
    },
    {
      name: "missing percentage is unavailable",
      selectedWindows: {
        ...windows,
        weekly: {...windows.weekly!, remainingPercent: null},
      },
      thresholds: [{window: "weekly", minimumRemainingPercent: 0}],
      expected: "unavailable",
    },
    {
      name: "unavailable takes precedence over another breach",
      selectedWindows: {...windows, weekly: null},
      thresholds: [
        {window: "fiveHour", minimumRemainingPercent: 21},
        {window: "weekly", minimumRemainingPercent: 10},
      ],
      expected: "unavailable",
    },
  ];

  for (const item of cases) {
    expect(evaluateUsageThresholds(item.selectedWindows, item.thresholds), item.name).toBe(
      item.expected
    );
  }
});
