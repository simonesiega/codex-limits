import type {CodexLimitsResult, CouponResult} from "../../../src/package/core/types";

export function createFakeLimitsResult(): CodexLimitsResult {
  return {
    windows: {
      fiveHour: {
        label: "5-hour usage limit",
        remainingPercent: 93,
        usedPercent: 7,
        resetsAt: "2026-07-05T19:55:00.000Z",
        resetsIn: "9h 55m",
      },
      weekly: {
        label: "Weekly usage limit",
        remainingPercent: 11,
        usedPercent: 89,
        resetsAt: "2026-07-07T11:40:00.000Z",
        resetsIn: "2d 1h 40m",
      },
    },
    usageSource: {
      kind: "api",
      label: "API",
      endpoint: "https://chatgpt.com/backend-api/codex/usage",
    },
    coupons: createFakeCouponResult(),
    warnings: [],
  };
}

export function createFakeCouponResult(): CouponResult {
  return {
    status: "available",
    available: 2,
    earnedThisPeriod: 4,
    nextExpirationDate: "Saturday 11 July 2026",
    nextExpirationIn: "7d 4h 38m",
    items: [
      {
        index: 1,
        status: "available",
        grantedAt: "2026-06-11T20:38:07Z",
        expiresAt: "2026-07-11T20:38:07Z",
        expirationDate: "Saturday 11 July 2026",
        expiresIn: "7d 4h 38m",
      },
      {
        index: 2,
        status: "available",
        grantedAt: "2026-06-17T18:42:45Z",
        expiresAt: "2026-07-17T18:42:45Z",
        expirationDate: "Friday 17 July 2026",
        expiresIn: "13d 1h 13m",
      },
    ],
    warnings: [],
    source: {
      live: true,
      label: "live Codex reset-credit endpoint",
      endpoint: "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
    },
  };
}
