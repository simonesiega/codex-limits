/**
 * @fileoverview Behavioral coverage for format. The cases document the supported contract and isolate filesystem, network, or host state where applicable.
 */
import {expect, test} from "bun:test";
import {formatAgentLimits} from "@/agents/shared/format";
import {createFakeLimitsResult} from "@tests/package/fixtures/fake-results";

test("formatAgentLimits renders the complete compact agent view", () => {
  expect(formatAgentLimits(createFakeLimitsResult())).toBe(
    [
      "5-hour  Healthy",
      "Remaining  93% remaining",
      "[====================  ] 93%",
      "Reset      in 9h 55m",
      "",
      "Weekly  Critical",
      "Remaining  11% remaining",
      "[==                    ] 11%",
      "Reset      in 2d 1h 40m",
      "",
      "Reset credits  2 credits available",
      "Next expires   7d 4h 38m (Saturday 11 July 2026)",
    ].join("\n")
  );
});

test("formatAgentLimits preserves unknown usage percentages", () => {
  const result = createFakeLimitsResult();
  result.windows.fiveHour!.remainingPercent = null;
  result.windows.fiveHour!.usedPercent = null;

  const output = formatAgentLimits(result);

  expect(output).toContain("Remaining  Unknown");
  expect(output).toContain("[                      ] Unknown");
  expect(output).not.toContain("[                      ] 0%");
});

test("formatAgentLimits omits usage windows that were not provided", () => {
  const result = createFakeLimitsResult();
  result.windows.fiveHour = null;

  expect(formatAgentLimits(result)).toBe(
    [
      "Weekly  Critical",
      "Remaining  11% remaining",
      "[==                    ] 11%",
      "Reset      in 2d 1h 40m",
      "",
      "Reset credits  2 credits available",
      "Next expires   7d 4h 38m (Saturday 11 July 2026)",
    ].join("\n")
  );
});

test("formatAgentLimits renders safe unavailable data and warnings", () => {
  const result = createFakeLimitsResult();
  result.windows = {fiveHour: null, weekly: null};
  result.coupons = null;
  result.warnings = ["Safe normalized warning."];

  expect(formatAgentLimits(result)).toBe(
    [
      "Usage limits  Unavailable",
      "",
      "Reset credits  Unknown",
      "",
      "Warnings",
      "- Safe normalized warning.",
    ].join("\n")
  );
});
