import {expect, test} from "bun:test";
import {formatOpencodeLimits} from "@/agents/opencode/format";
import {createFakeLimitsResult} from "../../package/fixtures/fake-results";

test("formatOpencodeLimits renders compact local-only UI", () => {
  const output = formatOpencodeLimits(createFakeLimitsResult());

  expect(output).toBe(`5-hour  Healthy
Remaining  93% remaining
[====================  ] 93%
Reset      in 9h 55m

Weekly  Critical
Remaining  11% remaining
[==                    ] 11%
Reset      in 2d 1h 40m

Reset credits  2 credits available
Next expires   7d 4h 38m (Saturday 11 July 2026)`);
});
