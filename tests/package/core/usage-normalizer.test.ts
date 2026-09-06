import {expect, test} from "bun:test";
import type {CodexStateReadResult} from "@/package/core/types";
import {
  parseUsageFromState,
  parseUsageWindowsFromRateLimits,
  unavailableLocalUsage,
} from "@/package/core/usage/normalizer";

test("parseUsageFromState normalizes remaining and used percentages", () => {
  const result = parseUsageFromState(
    stateFromJson({
      updatedAt: "2026-07-05T10:00:00.000Z",
      fiveHour: {used: "42%", resetsAt: "2026-07-05T12:00:00.000Z"},
      weekly: {remainingPercent: 11, resetsAt: "2026-07-07T11:40:00.000Z"},
    }),
    new Date("2026-07-05T10:00:00.000Z")
  );

  expect(result.status).toBe("available");
  expect(result.windows.fiveHour?.remainingPercent).toBe(58);
  expect(result.windows.fiveHour?.resetsIn).toBe("2h");
  expect(result.windows.weekly?.usedPercent).toBe(89);
});

test("parseUsageWindowsFromRateLimits uses declared durations before legacy slot names", () => {
  const windows = parseUsageWindowsFromRateLimits(
    {
      primary_window: {
        used_percent: 21,
        limit_window_seconds: 604_800,
        reset_at: 1_767_830_400,
      },
      secondary_window: null,
    },
    new Date("2026-01-01T00:00:00.000Z")
  );

  expect(windows.fiveHour).toBeNull();
  expect(windows.weekly?.remainingPercent).toBe(79);
  expect(windows.weekly?.resetsIn).toBe("7d");
});

test("parseUsageFromState honors declared durations in local data", () => {
  const result = parseUsageFromState(
    stateFromJson({
      rate_limit: {
        primary_window: {
          used_percent: 21,
          limit_window_seconds: 604_800,
          reset_at: 1_767_830_400,
        },
        secondary_window: null,
      },
    }),
    new Date("2026-01-01T00:00:00.000Z")
  );

  expect(result.windows.fiveHour).toBeNull();
  expect(result.windows.weekly?.remainingPercent).toBe(79);
  expect(result.windows.weekly?.resetsIn).toBe("7d");

  const directWindow = parseUsageFromState(
    stateFromJson({
      used_percent: 22,
      limit_window_seconds: 604_800,
      reset_at: 1_767_830_400,
    }),
    new Date("2026-01-01T00:00:00.000Z")
  );
  expect(directWindow.windows.fiveHour).toBeNull();
  expect(directWindow.windows.weekly?.remainingPercent).toBe(78);
});

test("parseUsageFromState returns partial for incomplete data", () => {
  const result = parseUsageFromState(stateFromJson({fiveHour: {remainingPercent: 80}}));

  expect(result.status).toBe("partial");
  expect(result.windows.fiveHour?.remainingPercent).toBe(80);
  expect(result.windows.weekly).toBeNull();
});

test("parseUsageFromState only accepts normalized compact reset durations", () => {
  const privateText = "Confidential project Apollo launch";
  const unsafe = parseUsageFromState(
    stateFromJson({fiveHour: {remainingPercent: 80, resetsIn: privateText}})
  );
  const compact = parseUsageFromState(
    stateFromJson({fiveHour: {remainingPercent: 80, resetsIn: "1d 2h 3m 45s"}})
  );

  expect(unsafe.windows.fiveHour?.resetsIn).toBeNull();
  expect(JSON.stringify(unsafe)).not.toContain(privateText);
  expect(compact.windows.fiveHour?.resetsIn).toBe("1d 2h 3m");
});

test("unavailableLocalUsage preserves safe warnings", () => {
  const result = unavailableLocalUsage(["No readable local Codex home directory was found."]);

  expect(result.status).toBe("unavailable");
  expect(result.windows.fiveHour).toBeNull();
  expect(result.warnings).toEqual(["No readable local Codex home directory was found."]);
});

function stateFromJson(json: unknown): CodexStateReadResult {
  return {
    homePath: "fake-home",
    files: [{path: "fake-home/limits.json", relativePath: "limits.json", json, error: null}],
    warnings: [],
  };
}
