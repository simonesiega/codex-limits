import {expect, test} from "bun:test";
import {
  consumeResetCoupon,
  LIVE_RESET_COUPONS_CONSUME_ENDPOINT,
} from "@/package/core/coupons/reset-coupons";
import {selectResetCoupon} from "@/package/core/coupons/selection";
import type {AuthenticatedJsonRequest, FetchLike} from "@/package/core/types";
import {createFakeCouponResult} from "@tests/package/fixtures/fake-results";

const ENV = {
  CODEX_LIMITS_ACCESS_TOKEN: "fake-access-token",
  CODEX_LIMITS_ACCOUNT_ID: "fake-account-id",
};
const REDEEM_REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

test("consumeResetCoupon sends an exact coupon ID with one idempotency key", async () => {
  const requests: AuthenticatedJsonRequest[] = [];
  const result = await consumeResetCoupon("RateLimitResetCredit_test-1", {
    env: ENV,
    endpoint: "https://example.test/reset-credits",
    redeemRequestId: REDEEM_REQUEST_ID,
    transport: async (request) => {
      requests.push(request);
      return {
        ok: true,
        status: 200,
        transport: "fetch",
        payload: {code: "reset", windows_reset: 2},
      };
    },
  });

  expect(result).toEqual({outcome: "reset", windowsReset: 2});
  expect(requests).toHaveLength(1);
  expect(requests[0]?.endpoint).toBe("https://example.test/reset-credits/consume");
  expect(requests[0]?.method).toBe("POST");
  expect(requests[0]?.headers.Authorization).toBe("Bearer fake-access-token");
  expect(requests[0]?.headers["ChatGPT-Account-ID"]).toBe("fake-account-id");
  expect(requests[0]?.headers["Content-Type"]).toBe("application/json");
  expect(JSON.parse(requests[0]?.body ?? "")).toEqual({
    credit_id: "RateLimitResetCredit_test-1",
    redeem_request_id: REDEEM_REQUEST_ID,
  });
  expect(JSON.stringify(result)).not.toContain("fake-access-token");
  expect(JSON.stringify(result)).not.toContain("fake-account-id");
});

test("consumeResetCoupon uses the bounded POST transport and default consume endpoint", async () => {
  const requestUrls: string[] = [];
  const requestInits: Array<Parameters<FetchLike>[1]> = [];
  const result = await consumeResetCoupon("coupon-1", {
    env: ENV,
    redeemRequestId: REDEEM_REQUEST_ID,
    fetch: async (url, init) => {
      requestUrls.push(url);
      requestInits.push(init);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({code: "nothing_to_reset"}),
      };
    },
  });

  expect(result.outcome).toBe("nothing-to-reset");
  expect(requestUrls).toEqual([LIVE_RESET_COUPONS_CONSUME_ENDPOINT]);
  expect(requestInits[0]?.method).toBe("POST");
  expect(requestInits[0]?.body).toContain(REDEEM_REQUEST_ID);
  expect(LIVE_RESET_COUPONS_CONSUME_ENDPOINT).toEndWith("/wham/rate-limit-reset-credits/consume");
});

test("consumeResetCoupon normalizes every safe service outcome", async () => {
  const cases = [
    ["reset", "reset"],
    ["already_redeemed", "already-redeemed"],
    ["nothing_to_reset", "nothing-to-reset"],
    ["no_credit", "no-credit"],
    ["future_code", "unconfirmed"],
  ] as const;

  for (const [code, outcome] of cases) {
    const result = await consumeResetCoupon("coupon-1", {
      env: ENV,
      redeemRequestId: REDEEM_REQUEST_ID,
      transport: async () => ({
        ok: true,
        status: 200,
        transport: "fetch",
        payload: {code},
      }),
    });
    expect(result.outcome, code).toBe(outcome);
  }
});

test("consumeResetCoupon never sends invalid IDs or requests without credentials", async () => {
  let requests = 0;
  const transport = async () => {
    requests += 1;
    return {
      ok: true as const,
      status: 200,
      transport: "fetch" as const,
      payload: {code: "reset"},
    };
  };

  expect(
    await consumeResetCoupon("invalid id", {
      env: ENV,
      redeemRequestId: REDEEM_REQUEST_ID,
      transport,
    })
  ).toEqual({outcome: "unconfirmed", windowsReset: null});
  expect(
    await consumeResetCoupon("coupon-1", {
      env: {},
      homeDirectory: "Z:/missing-codex-home",
      redeemRequestId: REDEEM_REQUEST_ID,
      transport,
    })
  ).toEqual({outcome: "unconfirmed", windowsReset: null});
  expect(requests).toBe(0);
});

test("selectResetCoupon matches display indexes and the earliest available expiration", () => {
  const coupons = createFakeCouponResult();

  expect(selectResetCoupon(coupons, {kind: "soonest"})).toEqual({
    kind: "selected",
    coupon: coupons.items[0]!,
  });
  expect(selectResetCoupon(coupons, {kind: "index", couponIndex: 2})).toEqual({
    kind: "selected",
    coupon: coupons.items[1]!,
  });
  expect(selectResetCoupon(coupons, {kind: "index", couponIndex: 3})).toEqual({
    kind: "not-found",
  });

  const unidentifiedSoonest = createFakeCouponResult();
  unidentifiedSoonest.items[0]!.id = null;
  expect(selectResetCoupon(unidentifiedSoonest, {kind: "soonest"})).toEqual({
    kind: "details-unavailable",
  });

  const inconsistentCount = createFakeCouponResult();
  inconsistentCount.items[0]!.status = "redeemed";
  expect(selectResetCoupon(inconsistentCount, {kind: "soonest"})).toEqual({
    kind: "details-unavailable",
  });

  const partialList = createFakeCouponResult();
  partialList.status = "partial";
  expect(selectResetCoupon(partialList, {kind: "soonest"})).toEqual({
    kind: "details-unavailable",
  });

  const unsupportedType = createFakeCouponResult();
  unsupportedType.items[0]!.resetType = "future_reset_type";
  expect(selectResetCoupon(unsupportedType, {kind: "index", couponIndex: 1})).toEqual({
    kind: "details-unavailable",
  });
  expect(selectResetCoupon(unsupportedType, {kind: "soonest"})).toEqual({
    kind: "details-unavailable",
  });

  coupons.items[0]!.status = "redeemed";
  expect(selectResetCoupon(coupons, {kind: "index", couponIndex: 1})).toEqual({
    kind: "not-available",
  });

  coupons.items[1]!.id = null;
  coupons.items[1]!.status = "available";
  coupons.available = 1;
  expect(selectResetCoupon(coupons, {kind: "index", couponIndex: 2})).toEqual({
    kind: "details-unavailable",
  });
  expect(selectResetCoupon(coupons, {kind: "soonest"})).toEqual({
    kind: "details-unavailable",
  });

  coupons.items = [];
  coupons.available = null;
  coupons.status = "partial";
  expect(selectResetCoupon(coupons, {kind: "soonest"})).toEqual({
    kind: "details-unavailable",
  });
});
