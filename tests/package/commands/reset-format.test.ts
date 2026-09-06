import {expect, test} from "bun:test";
import {formatResetOutcome, formatResetRecap} from "@/package/commands/reset/format";
import type {CouponItem, ResetCouponResult} from "@/package/core/types";
import {createFakeCouponResult} from "@tests/package/fixtures/fake-results";

test("formatResetOutcome describes every normalized service outcome", () => {
  const cases: Array<{result: ResetCouponResult; expected: string}> = [
    {
      result: {outcome: "reset", windowsReset: 2},
      expected:
        "Codex usage reset successfully. One coupon was used, and 2 usage windows were reset.\n",
    },
    {
      result: {outcome: "reset", windowsReset: 1},
      expected:
        "Codex usage reset successfully. One coupon was used, and 1 usage window was reset.\n",
    },
    {
      result: {outcome: "reset", windowsReset: null},
      expected: "Codex usage reset successfully. One coupon was used.\n",
    },
    {
      result: {outcome: "already-redeemed", windowsReset: 0},
      expected: "This reset request was already completed. No additional coupon was used.\n",
    },
    {
      result: {outcome: "nothing-to-reset", windowsReset: 0},
      expected: "Your Codex usage does not need a reset right now. No coupon was used.\n",
    },
    {
      result: {outcome: "no-credit", windowsReset: 0},
      expected: "The selected reset coupon is no longer available. No coupon was used.\n",
    },
    {
      result: {outcome: "unconfirmed", windowsReset: null},
      expected: "The reset result could not be confirmed. Check your limits before trying again.\n",
    },
  ];

  for (const item of cases) {
    expect(formatResetOutcome(item.result), item.result.outcome).toBe(item.expected);
  }
});

test("formatResetRecap safely formats available expiration details", () => {
  const source = createFakeCouponResult().items[0]!;
  const cases: Array<{
    name: string;
    coupon: CouponItem;
    expectedExpiration: string;
  }> = [
    {
      name: "date and duration",
      coupon: source,
      expectedExpiration: "Saturday 11 July 2026 (7d 4h 38m)",
    },
    {
      name: "duration only",
      coupon: {...source, expirationDate: null},
      expectedExpiration: "7d 4h 38m",
    },
    {
      name: "date only",
      coupon: {...source, expiresIn: null},
      expectedExpiration: "Saturday 11 July 2026",
    },
    {
      name: "unknown",
      coupon: {...source, expirationDate: null, expiresIn: null},
      expectedExpiration: "Unknown",
    },
  ];

  for (const item of cases) {
    const output = formatResetRecap(item.coupon, "index", null);

    expect(output, item.name).toContain(`Expiration: ${item.expectedExpiration}`);
    expect(output, item.name).toContain("Available coupons: Unknown");
    expect(output, item.name).not.toContain(source.id!);
  }
});
