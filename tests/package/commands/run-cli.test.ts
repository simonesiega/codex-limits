import {expect, test} from "bun:test";
import {formatCoupons} from "@/package/commands/coupons/format";
import {runCli} from "@/package/commands/run-cli";
import {sanitizePublicErrorMessage} from "@/package/commands/safe-error";
import {formatStatus} from "@/package/commands/status/format";
import {unavailableCoupons} from "@/package/core/coupons/reset-coupons";
import {createFakeCouponResult, createFakeLimitsResult} from "@tests/package/fixtures/fake-results";

test("runCli renders TUI for the default command", async () => {
  let rendered = false;
  const exitCode = await runCli([], {
    usage: {loadLimits: async () => createFakeLimitsResult()},
    ui: {
      renderDashboard: () => {
        rendered = true;
      },
    },
  });

  expect(exitCode).toBe(0);
  expect(rendered).toBe(true);
});

test("runCli prints JSON only in JSON mode", async () => {
  const output: string[] = [];
  const errors: string[] = [];
  const exitCode = await runCli(["--json"], {
    io: {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
    },
    usage: {loadLimits: async () => createFakeLimitsResult()},
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
    io: {stdout: (text) => limitsOutput.push(text)},
    usage: {loadLimits: async () => result},
  });
  await runCli(["coupons", "--json"], {
    io: {stdout: (text) => couponsOutput.push(text)},
    coupons: {loadCoupons: async () => createFakeCouponResult()},
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
    io: {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
    },
    usage: {
      loadLimits: async () => {
        throw new Error("Bearer fake-secret-token at C:/private/auth.json");
      },
    },
  });

  expect(exitCode).toBe(1);
  expect(output).toEqual([]);
  expect(errors.join("")).toBe("codex-limits: Could not load Codex limits.\n");
  expect(errors.join("")).not.toContain("fake-secret-token");
  expect(errors.join("")).not.toContain("private");
});

test("runCli prints status, coupons, generated help, and version", async () => {
  const statusOutput: string[] = [];
  const couponsOutput: string[] = [];
  const helpOutput: string[] = [];
  const versionOutput: string[] = [];

  await runCli(["status"], {
    io: {stdout: (text) => statusOutput.push(text)},
    usage: {loadLimits: async () => createFakeLimitsResult()},
  });
  await runCli(["coupons"], {
    io: {stdout: (text) => couponsOutput.push(text)},
    coupons: {loadCoupons: async () => createFakeCouponResult()},
  });
  await runCli(["--help"], {io: {stdout: (text) => helpOutput.push(text)}});
  await runCli(["--version"], {
    io: {stdout: (text) => versionOutput.push(text)},
    packageInfo: {version: "9.9.9"},
  });

  expect(statusOutput.join("")).toContain("Usage Limits");
  expect(couponsOutput.join("")).toContain("Reset Coupons");
  expect(helpOutput.join("")).toContain("codex-limits status");
  expect(helpOutput.join("")).toContain("agents");
  expect(versionOutput.join("")).toBe("9.9.9\n");
});

test("runCli generates nested and compatibility command help", async () => {
  const agentsOutput: string[] = [];
  const installOutput: string[] = [];
  const initOutput: string[] = [];

  await runCli(["agents", "--help"], {
    io: {stdout: (text) => agentsOutput.push(text)},
  });
  await runCli(["agents", "install", "--help"], {
    io: {stdout: (text) => installOutput.push(text)},
  });
  await runCli(["init", "--help"], {
    io: {stdout: (text) => initOutput.push(text)},
  });

  expect(agentsOutput.join("")).toContain("install  Install optional agent integrations");
  expect(installOutput.join("")).toContain("[<agent...>]");
  expect(initOutput.join("")).toContain("codex-limits init --opencode");
});

test("runCli returns non-zero with relevant help for invalid input", async () => {
  const errors: string[] = [];
  const exitCode = await runCli(["agents", "unknown"], {
    io: {stderr: (text) => errors.push(text)},
  });

  expect(exitCode).toBe(1);
  expect(errors.join("")).toContain("Unknown agents command: unknown");
  expect(errors.join("")).toContain("codex-limits agents <command>");
});

test("coupon JSON omits source metadata and redacts warning credentials", async () => {
  const output: string[] = [];
  await runCli(["coupons", "--json"], {
    io: {stdout: (text) => output.push(text)},
    coupons: {
      loadCoupons: async () =>
        unavailableCoupons("https://example.test/?access_token=fake-secret-token", [
          "Authorization: Bearer fake-secret-token",
        ]),
    },
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

test("public command errors reject paths, controls, and oversized messages", () => {
  expect(
    sanitizePublicErrorMessage(
      "Bearer fake-secret-token at (C:/private/config.json)",
      "Command failed."
    )
  ).toBe("Command failed.");
  expect(sanitizePublicErrorMessage("Safe\u001b[31m\u009b32m message", "Command failed.")).toBe(
    "Safe?[31m?32m message"
  );
  expect(sanitizePublicErrorMessage("details:C:/private/config.json", "Command failed.")).toBe(
    "Command failed."
  );
  expect(sanitizePublicErrorMessage("x".repeat(241), "Command failed.")).toBe("Command failed.");
});

test("command formatters do not expose secret-like values", () => {
  const statusOutput = formatStatus({...createFakeLimitsResult(), warnings: ["[redacted]"]});
  const couponsOutput = formatCoupons(unavailableCoupons("https://example.test", ["fake warning"]));

  expect(statusOutput).toContain("Warnings:");
  expect(couponsOutput).toContain("Warnings:");
});
