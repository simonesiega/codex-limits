import {expect, test} from "bun:test";
import {formatOpencodeLimits} from "../../../src/agents/opencode/format";
import {createFakeLimitsResult} from "../../package/fixtures/fake-results";

test("formatOpencodeLimits renders compact local-only UI", () => {
  const output = formatOpencodeLimits(createFakeLimitsResult());

  expect(output).toContain("5-hour");
  expect(output).toContain("Weekly");
  expect(output).toContain("Remaining");
  expect(output).toContain("93% remaining");
  expect(output).toContain("Healthy");
  expect(output).toContain("=");
  expect(output).toContain("Reset credits");
  expect(output).toContain("available");
  expect(output).toContain("2");
  expect(output).toContain("Next expires");
  expect(output).not.toContain("\x1b[");
  expect(output).not.toContain("\x1b[2m");
  expect(output).not.toContain("\x1b[31m");
  expect(output).not.toContain("\x1b[32m");
  expect(output).not.toContain("\x1b[33m");
  expect(output).not.toContain("░");
  expect(output).not.toContain("╭");
  expect(output).not.toContain("╰");
  expect(output).not.toContain("r refresh");
  expect(output).not.toContain("c coupons");
});
