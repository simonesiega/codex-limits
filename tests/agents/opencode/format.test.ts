import {expect, test} from "bun:test";
import {formatOpencodeLimits} from "@/agents/opencode/format";
import {createFakeLimitsResult} from "@tests/package/fixtures/fake-results";

test("formatOpencodeLimits renders compact local-only UI", () => {
  const output = formatOpencodeLimits(createFakeLimitsResult());
  const expected = [
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
  ].join("\n");

  expect(output).toBe(expected);
});

test("formatOpencodeLimits omits the 5-hour block when only weekly usage is provided", () => {
  const result = createFakeLimitsResult();
  result.windows.fiveHour = null;

  const output = formatOpencodeLimits(result);
  const expected = [
    "Weekly  Critical",
    "Remaining  11% remaining",
    "[==                    ] 11%",
    "Reset      in 2d 1h 40m",
    "",
    "Reset credits  2 credits available",
    "Next expires   7d 4h 38m (Saturday 11 July 2026)",
  ].join("\n");

  expect(output).toBe(expected);
  expect(output).not.toContain("5-hour");
  expect(output).not.toContain("80% remaining");
});
