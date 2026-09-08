/**
 * @fileoverview Behavioral coverage for reset coupon. The cases document the supported contract and isolate filesystem, network, or host state where applicable.
 */
import {expect, test} from "bun:test";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  consumeResetCoupon,
  LIVE_RESET_COUPONS_CONSUME_ENDPOINT,
} from "@/package/core/coupons/reset-coupons";
import {selectResetCoupon} from "@/package/core/coupons/selection";
import type {AuthenticatedJsonRequest, CouponResult, FetchLike} from "@/package/core/types";
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

test("consumeResetCoupon ignores malformed reset-window counters", async () => {
  for (const windowsReset of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "2"]) {
    const result = await consumeResetCoupon("coupon-1", {
      env: ENV,
      redeemRequestId: REDEEM_REQUEST_ID,
      transport: async () => ({
        ok: true,
        status: 200,
        transport: "fetch",
        payload: {code: "reset", windows_reset: windowsReset},
      }),
    });

    expect(result, String(windowsReset)).toEqual({outcome: "reset", windowsReset: null});
  }
});

test("consumeResetCoupon rejects unverifiable requests before transport", async () => {
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
  const cases = [
    {
      name: "invalid coupon ID",
      couponId: "invalid id",
      env: ENV,
      redeemRequestId: REDEEM_REQUEST_ID,
    },
    {
      name: "invalid idempotency key",
      couponId: "coupon-1",
      env: ENV,
      redeemRequestId: "not-a-uuid",
    },
    {
      name: "missing credentials",
      couponId: "coupon-1",
      env: {},
      redeemRequestId: REDEEM_REQUEST_ID,
      homeDirectory: join(tmpdir(), `codex-limits-missing-reset-${crypto.randomUUID()}`),
    },
  ];

  for (const item of cases) {
    const result = await consumeResetCoupon(item.couponId, {
      env: item.env,
      ...(item.homeDirectory ? {homeDirectory: item.homeDirectory} : {}),
      redeemRequestId: item.redeemRequestId,
      transport,
    });

    expect(result, item.name).toEqual({outcome: "unconfirmed", windowsReset: null});
  }
  expect(requests).toBe(0);
});

test("consumeResetCoupon returns unconfirmed when the service result cannot be verified", async () => {
  const cases = [
    {
      name: "transport failure",
      transport: async () => ({
        ok: false as const,
        code: "network-error" as const,
        status: null,
      }),
    },
    {
      name: "transport exception",
      transport: async () => {
        throw new Error("private transport detail");
      },
    },
    {
      name: "malformed payload",
      transport: async () => ({
        ok: true as const,
        status: 200,
        transport: "fetch" as const,
        payload: null,
      }),
    },
  ];

  for (const item of cases) {
    const result = await consumeResetCoupon("coupon-1", {
      env: ENV,
      redeemRequestId: REDEEM_REQUEST_ID,
      transport: item.transport,
    });

    expect(result, item.name).toEqual({outcome: "unconfirmed", windowsReset: null});
  }
});

test("selectResetCoupon selects an available coupon by display index", () => {
  const coupons = createFakeCouponResult();

  expect(selectResetCoupon(coupons, {kind: "index", couponIndex: 2})).toEqual({
    kind: "selected",
    coupon: coupons.items[1]!,
  });
});

test("selectResetCoupon classifies unsafe indexed selections", () => {
  const cases: Array<{
    name: string;
    couponIndex: number;
    configure: (coupons: CouponResult) => void;
    expectedKind: "details-unavailable" | "not-available" | "not-found";
  }> = [
    {
      name: "missing index",
      couponIndex: 3,
      configure: () => undefined,
      expectedKind: "not-found",
    },
    {
      name: "redeemed coupon",
      couponIndex: 1,
      configure: (coupons) => {
        coupons.items[0]!.status = "redeemed";
      },
      expectedKind: "not-available",
    },
    {
      name: "missing coupon ID",
      couponIndex: 1,
      configure: (coupons) => {
        coupons.items[0]!.id = null;
      },
      expectedKind: "details-unavailable",
    },
    {
      name: "unsupported reset type",
      couponIndex: 1,
      configure: (coupons) => {
        coupons.items[0]!.resetType = "future_reset_type";
      },
      expectedKind: "details-unavailable",
    },
  ];

  for (const item of cases) {
    const coupons = createFakeCouponResult();
    item.configure(coupons);

    expect(
      selectResetCoupon(coupons, {kind: "index", couponIndex: item.couponIndex}).kind,
      item.name
    ).toBe(item.expectedKind);
  }
});

test("selectResetCoupon chooses the earliest verified expiration", () => {
  const coupons = createFakeCouponResult();
  coupons.items = [coupons.items[1]!, coupons.items[0]!];

  expect(selectResetCoupon(coupons, {kind: "soonest"})).toEqual({
    kind: "selected",
    coupon: coupons.items[1]!,
  });
});

test("selectResetCoupon fails closed when the soonest coupon cannot be verified", () => {
  const cases: Array<{name: string; configure: (coupons: CouponResult) => void}> = [
    {
      name: "partial response",
      configure: (coupons) => {
        coupons.status = "partial";
      },
    },
    {
      name: "inconsistent available count",
      configure: (coupons) => {
        coupons.available = 1;
      },
    },
    {
      name: "missing coupon ID",
      configure: (coupons) => {
        coupons.items[0]!.id = null;
      },
    },
    {
      name: "missing expiration",
      configure: (coupons) => {
        coupons.items[0]!.expiresAt = null;
      },
    },
    {
      name: "unsupported reset type",
      configure: (coupons) => {
        coupons.items[0]!.resetType = "future_reset_type";
      },
    },
  ];

  for (const item of cases) {
    const coupons = createFakeCouponResult();
    item.configure(coupons);

    expect(selectResetCoupon(coupons, {kind: "soonest"}), item.name).toEqual({
      kind: "details-unavailable",
    });
  }
});

test("selectResetCoupon distinguishes no coupons from missing coupon details", () => {
  const noneAvailable = createFakeCouponResult();
  noneAvailable.available = 0;
  noneAvailable.items = [];

  const missingDetails = createFakeCouponResult();
  missingDetails.available = 1;
  missingDetails.items = [];

  expect(selectResetCoupon(noneAvailable, {kind: "soonest"})).toEqual({
    kind: "none-available",
  });
  expect(selectResetCoupon(missingDetails, {kind: "soonest"})).toEqual({
    kind: "details-unavailable",
  });
});
