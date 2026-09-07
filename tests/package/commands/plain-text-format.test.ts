/**
 * @fileoverview Behavioral coverage for plain text format. The cases document the supported contract and isolate filesystem, network, or host state where applicable.
 */
import {expect, test} from "bun:test";
import {formatCoupons} from "@/package/commands/coupons/format";
import {formatStatus} from "@/package/commands/status/format";
import {unavailableCoupons} from "@/package/core/coupons/reset-coupons";
import {createFakeCouponResult, createFakeLimitsResult} from "@tests/package/fixtures/fake-results";

test("formatStatus omits usage windows that were not provided", () => {
  const result = createFakeLimitsResult();
  result.windows.fiveHour = null;

  const output = formatStatus(result);

  expect(output).toContain("Weekly usage limit");
  expect(output).not.toContain("5-hour usage limit");
  expect(output).not.toContain("Usage limit: Unknown");
});

test("formatStatus appends normalized warnings", () => {
  const output = formatStatus({...createFakeLimitsResult(), warnings: ["Safe warning."]});

  expect(output).toContain("Warnings:\n- Safe warning.");
});

test("formatCoupons appends normalized warnings for unavailable data", () => {
  const output = formatCoupons(unavailableCoupons("https://example.test", ["Safe warning."]));

  expect(output).toContain("Available coupons: Unknown");
  expect(output).toContain("Warnings:\n- Safe warning.");
});

test("formatCoupons labels incomplete coupon fields as unknown", () => {
  const result = createFakeCouponResult();
  result.items = [{...result.items[0]!, status: null, expiresIn: null}];

  expect(formatCoupons(result)).toContain("1. Unknown expires in Unknown");
});

test("formatCoupons omits private coupon redemption metadata", () => {
  const output = formatCoupons(createFakeCouponResult());

  expect(output).toContain("Reset Coupons");
  expect(output).not.toContain("RateLimitResetCredit_test");
  expect(output).not.toContain("codex_rate_limits");
});
