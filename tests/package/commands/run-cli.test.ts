import {expect, test} from "bun:test";
import {runCli} from "@/package/commands/run-cli";
import {formatCoupons} from "@/package/commands/coupons";
import {formatStatus} from "@/package/commands/status";
import {unavailableCoupons} from "@/package/core/coupons/reset-coupons";
import {createFakeCouponResult, createFakeLimitsResult} from "../fixtures/fake-results";

test("runCli renders TUI for the default command", async () => {
  let rendered = false;
  const exitCode = await runCli([], {
    getLimits: async () => createFakeLimitsResult(),
    renderTui: () => {
      rendered = true;
    },
  });

  expect(exitCode).toBe(0);
  expect(rendered).toBe(true);
});

test("runCli prints JSON only in JSON mode", async () => {
  const output: string[] = [];
  const errors: string[] = [];
  const exitCode = await runCli(["--json"], {
    stdout: (text) => output.push(text),
    stderr: (text) => errors.push(text),
    getLimits: async () => createFakeLimitsResult(),
  });

  const parsed = JSON.parse(output.join("")) as {
    status?: string;
    windows: unknown;
    coupons: {status?: string; source?: unknown} | null;
  };

  expect(exitCode).toBe(0);
  expect(errors).toEqual([]);
  expect(parsed.status).toBeUndefined();
  expect(parsed.windows).toBeTruthy();
  expect(parsed.coupons?.status).toBeUndefined();
  expect(parsed.coupons?.source).toBeUndefined();
});

test("runCli preserves the complete limits and coupon JSON contracts", async () => {
  const limitsOutput: string[] = [];
  const couponsOutput: string[] = [];
  const result = createFakeLimitsResult();

  await runCli(["--json"], {
    stdout: (text) => limitsOutput.push(text),
    getLimits: async () => result,
  });
  await runCli(["coupons", "--json"], {
    stdout: (text) => couponsOutput.push(text),
    getCoupons: async () => createFakeCouponResult(),
  });

  const expectedCoupons = {
    available: 2,
    earnedThisPeriod: 4,
    nextExpirationDate: "Saturday 11 July 2026",
    nextExpirationIn: "7d 4h 38m",
    items: result.coupons!.items,
    warnings: [],
  };
  expect(JSON.parse(limitsOutput.join(""))).toEqual({
    windows: result.windows,
    coupons: expectedCoupons,
    warnings: [],
  });
  expect(JSON.parse(couponsOutput.join(""))).toEqual(expectedCoupons);
  expect(Object.keys(JSON.parse(limitsOutput.join("")) as object)).toEqual([
    "windows",
    "coupons",
    "warnings",
  ]);
});

test("runCli writes no partial JSON when a loader fails", async () => {
  const output: string[] = [];
  const errors: string[] = [];
  const exitCode = await runCli(["--json"], {
    stdout: (text) => output.push(text),
    stderr: (text) => errors.push(text),
    getLimits: async () => {
      throw new Error("Bearer fake-secret-token at C:/private/auth.json");
    },
  });

  expect(exitCode).toBe(1);
  expect(output).toEqual([]);
  expect(errors.join("")).toBe("codex-limits: Could not load Codex limits.\n");
  expect(errors.join("")).not.toContain("fake-secret-token");
  expect(errors.join("")).not.toContain("private");
});

test("runCli prints status coupons help and version", async () => {
  const statusOutput: string[] = [];
  const couponsOutput: string[] = [];
  const helpOutput: string[] = [];
  const versionOutput: string[] = [];

  await runCli(["status"], {
    stdout: (text) => statusOutput.push(text),
    getLimits: async () => createFakeLimitsResult(),
  });
  await runCli(["coupons"], {
    stdout: (text) => couponsOutput.push(text),
    getCoupons: async () => createFakeCouponResult(),
  });
  await runCli(["--help"], {stdout: (text) => helpOutput.push(text)});
  await runCli(["--version"], {stdout: (text) => versionOutput.push(text), version: "9.9.9"});

  expect(statusOutput.join("")).toContain("Usage Limits");
  expect(couponsOutput.join("")).toContain("Reset Coupons");
  expect(helpOutput.join("")).toContain("codex-limits status");
  expect(versionOutput.join("")).toBe("9.9.9\n");
});

test("runCli delegates init help", async () => {
  const output: string[] = [];
  const exitCode = await runCli(["init", "--help"], {stdout: (text) => output.push(text)});

  expect(exitCode).toBe(0);
  expect(output.join("")).toContain("Install optional agent integrations");
});

test("runCli returns non-zero for unknown commands", async () => {
  const errors: string[] = [];
  const exitCode = await runCli(["unknown"], {stderr: (text) => errors.push(text)});

  expect(exitCode).toBe(1);
  expect(errors.join("")).toContain("Unknown command or option: unknown");
});

test("coupon JSON omits source metadata and redacts warning credentials", async () => {
  const output: string[] = [];
  await runCli(["coupons", "--json"], {
    stdout: (text) => output.push(text),
    getCoupons: async () =>
      unavailableCoupons("https://example.test/?access_token=fake-secret-token", [
        "Authorization: Bearer fake-secret-token",
      ]),
  });

  const text = output.join("");
  const parsed = JSON.parse(text) as Record<string, unknown>;
  expect(Object.keys(parsed)).toEqual([
    "available",
    "earnedThisPeriod",
    "nextExpirationDate",
    "nextExpirationIn",
    "items",
    "warnings",
  ]);
  expect(text).not.toContain("source");
  expect(text).not.toContain("example.test");
  expect(text).not.toContain("fake-secret-token");
  expect(text).toContain("[redacted]");
});

test("command formatters do not expose secret-like values", () => {
  const statusOutput = formatStatus({...createFakeLimitsResult(), warnings: ["[redacted]"]});
  const couponsOutput = formatCoupons(unavailableCoupons("https://example.test", ["fake warning"]));

  expect(statusOutput).toContain("Warnings:");
  expect(couponsOutput).toContain("Warnings:");
});
