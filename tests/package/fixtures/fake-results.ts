import type {CodexLimitsResult, CouponResult, CouponSummary} from "@/package/core/types";

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
    coupons: createFakeCouponSummary(),
    warnings: [],
  };
}

function createFakeCouponSummary(): CouponSummary {
  const result = createFakeCouponResult();
  return {
    status: result.status,
    available: result.available,
    earnedThisPeriod: result.earnedThisPeriod,
    nextExpirationDate: result.nextExpirationDate,
    nextExpirationIn: result.nextExpirationIn,
    items: result.items.map((item) => ({
      index: item.index,
      status: item.status,
      grantedAt: item.grantedAt,
      expiresAt: item.expiresAt,
      expirationDate: item.expirationDate,
      expiresIn: item.expiresIn,
    })),
    warnings: result.warnings,
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
        id: "RateLimitResetCredit_test-1",
        resetType: "codex_rate_limits",
        index: 1,
        status: "available",
        grantedAt: "2026-06-11T20:38:07Z",
        expiresAt: "2026-07-11T20:38:07Z",
        expirationDate: "Saturday 11 July 2026",
        expiresIn: "7d 4h 38m",
      },
      {
        id: "RateLimitResetCredit_test-2",
        resetType: "codex_rate_limits",
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
