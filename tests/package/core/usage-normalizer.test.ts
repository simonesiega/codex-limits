import {expect, test} from "bun:test";
import {formatDuration} from "../../../src/package/core/utils/date-time";
import {redactSensitiveText} from "../../../src/package/core/utils/redact";
import type {CodexStateReadResult} from "../../../src/package/core/types";
import {
  parseUsageFromState,
  unavailableLocalUsage,
} from "../../../src/package/core/usage/normalizer";

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

test("parseUsageFromState returns partial for incomplete data", () => {
  const result = parseUsageFromState(stateFromJson({fiveHour: {remainingPercent: 80}}));

  expect(result.status).toBe("partial");
  expect(result.windows.fiveHour?.remainingPercent).toBe(80);
  expect(result.windows.weekly).toBeNull();
});

test("unavailableLocalUsage preserves safe warnings", () => {
  const result = unavailableLocalUsage(["No readable local Codex home directory was found."]);

  expect(result.status).toBe("unavailable");
  expect(result.windows.fiveHour).toBeNull();
  expect(result.warnings).toEqual(["No readable local Codex home directory was found."]);
});

test("date and redaction helpers avoid seconds and secrets", () => {
  expect(formatDuration(7_000)).toBe("0m");
  expect(formatDuration(7 * 86_400_000 + 4 * 3_600_000 + 38 * 60_000 + 45_000)).toBe("7d 4h 38m");
  expect(redactSensitiveText("Authorization: Bearer fake-secret-token")).not.toContain(
    "fake-secret-token"
  );
});

function stateFromJson(json: unknown): CodexStateReadResult {
  return {
    homePath: "fake-home",
    files: [{path: "fake-home/limits.json", relativePath: "limits.json", json, error: null}],
    warnings: [],
  };
}
