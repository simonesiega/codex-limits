/**
 * @fileoverview Behavioral coverage for date time. The cases document the supported contract and isolate filesystem, network, or host state where applicable.
 */
import {expect, test} from "bun:test";
import {
  formatDuration,
  formatLongDate,
  formatShortDateTime,
  formatTime,
  isSameLocalDate,
  parseDateValue,
} from "@/package/core/utils/date-time";

test("formatDuration returns bounded minute-level output by default", () => {
  const cases = [
    {name: "negative", durationMs: -1_000, expected: "0m"},
    {name: "sub-minute", durationMs: 7_000, expected: "0m"},
    {
      name: "composite",
      durationMs: 7 * 86_400_000 + 4 * 3_600_000 + 38 * 60_000 + 45_000,
      expected: "7d 4h 38m",
    },
  ];

  for (const item of cases) {
    expect(formatDuration(item.durationMs), item.name).toBe(item.expected);
  }
  expect(formatDuration(7_000, {includeSeconds: true})).toBe("7s");
});

test("parseDateValue accepts supported timestamps and rejects invalid values", () => {
  const expected = "2026-01-01T00:00:00.000Z";

  expect(parseDateValue(1_767_225_600)?.toISOString()).toBe(expected);
  expect(parseDateValue(1_767_225_600_000)?.toISOString()).toBe(expected);
  expect(parseDateValue("1767225600")?.toISOString()).toBe(expected);
  expect(parseDateValue("not-a-date")).toBeNull();
  expect(parseDateValue(Number.NaN)).toBeNull();
});

test("date display helpers format local calendar fields consistently", () => {
  const date = new Date(2026, 6, 11, 9, 5);

  expect(formatLongDate(date)).toBe("Saturday 11 July 2026");
  expect(formatShortDateTime(date)).toBe("11 Jul 2026 09:05");
  expect(formatTime(date)).toBe("09:05");
  expect(isSameLocalDate(date, new Date(2026, 6, 11, 23, 59))).toBe(true);
  expect(isSameLocalDate(date, new Date(2026, 6, 12, 0, 0))).toBe(false);
});
