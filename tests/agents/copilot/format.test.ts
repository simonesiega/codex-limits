import {expect, test} from "bun:test";
import {formatCopilotLimits} from "@/agents/copilot/format";
import {createFakeLimitsResult} from "@tests/package/fixtures/fake-results";

test("formatCopilotLimits renders the compact shared agent view", () => {
  const output = formatCopilotLimits(createFakeLimitsResult());

  expect(output).toContain("5-hour  Healthy");
  expect(output).toContain("Weekly  Critical");
  expect(output).toContain("[====================  ] 93%");
  expect(output).toContain("Reset credits  2 credits available");
});
