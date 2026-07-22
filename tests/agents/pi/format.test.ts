import {expect, test} from "bun:test";
import {formatPiLimits} from "@/agents/pi/format";
import {createFakeLimitsResult} from "@tests/package/fixtures/fake-results";

test("formatPiLimits renders the compact shared agent view", () => {
  const output = formatPiLimits(createFakeLimitsResult());

  expect(output).toContain("5-hour  Healthy");
  expect(output).toContain("Weekly  Critical");
  expect(output).toContain("[====================  ] 93%");
  expect(output).toContain("Reset credits  2 credits available");
});
