import {expect, test} from "bun:test";
import type {AgentIntegration} from "@/agents";
import {formatCoupons} from "@/package/commands/coupons/format";
import {runCli} from "@/package/commands/run-cli";
import {sanitizePublicErrorMessage} from "@/package/commands/safe-error";
import {formatStatus} from "@/package/commands/status/format";
import {unavailableCoupons} from "@/package/core/coupons/reset-coupons";
import {createFakeCouponResult, createFakeLimitsResult} from "@tests/package/fixtures/fake-results";

function createDiagnosticIntegration(
  id: string,
  displayName: string,
  inspect: AgentIntegration["inspect"]
): AgentIntegration {
  return {
    id,
    displayName,
    description: `Enable ${displayName}.`,
    async install() {
      return {changed: false};
    },
    inspect,
  };
}

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
    items: result.coupons!.items.map((item) => ({
      index: item.index,
      status: item.status,
      grantedAt: item.grantedAt,
      expiresAt: item.expiresAt,
      expirationDate: item.expirationDate,
      expiresIn: item.expiresIn,
    })),
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
  expect(limitsOutput.join("")).not.toContain("RateLimitResetCredit_test");
  expect(couponsOutput.join("")).not.toContain("RateLimitResetCredit_test");
  expect(limitsOutput.join("")).not.toContain("codex_rate_limits");
  expect(couponsOutput.join("")).not.toContain("codex_rate_limits");
});

test("runCli prints safe doctor text and JSON diagnostics", async () => {
  const textOutput: string[] = [];
  const jsonOutput: string[] = [];
  const doctor = {
    loadCodexDiagnostics: async () => ({
      codexHomeDetected: true,
      authenticationFound: true,
      localUsageFound: true,
      liveEndpoint: "reachable" as const,
    }),
    nodeVersion: "22.0.0",
    operatingSystem: "Windows",
  };
  const agents = {
    integrations: [
      createDiagnosticIntegration("opencode", "OpenCode", async () => "installed"),
      createDiagnosticIntegration("pi", "pi", async () => "installed"),
    ],
  };

  const textExitCode = await runCli(["doctor"], {
    io: {stdout: (text) => textOutput.push(text)},
    agents,
    doctor,
    packageInfo: {version: "0.1.3"},
  });
  const jsonExitCode = await runCli(["doctor", "--json"], {
    io: {stdout: (text) => jsonOutput.push(text)},
    agents,
    doctor,
    packageInfo: {version: "0.1.3"},
  });

  expect(textExitCode).toBe(0);
  expect(jsonExitCode).toBe(0);
  expect(textOutput.join("")).toBe(
    [
      "Codex Limits diagnostics",
      "",
      "Package version:       0.1.3",
      "Node.js version:       22.0.0",
      "Operating system:      Windows",
      "Codex home detected:   Yes",
      "Authentication found:  Yes",
      "Local usage found:     Yes",
      "Live endpoint:         Reachable",
      "OpenCode integration:  Installed",
      "pi integration:        Installed",
      "",
      "No sensitive values were displayed.",
      "",
    ].join("\n")
  );
  expect(JSON.parse(jsonOutput.join(""))).toEqual({
    packageVersion: "0.1.3",
    nodeVersion: "22.0.0",
    operatingSystem: "Windows",
    codexHomeDetected: true,
    authenticationFound: true,
    localUsageFound: true,
    liveEndpoint: "reachable",
    agentIntegrations: {
      opencode: "installed",
      pi: "installed",
    },
  });
});

test("runCli writes no partial doctor JSON or sensitive errors when a core check fails", async () => {
  const output: string[] = [];
  const errors: string[] = [];
  const exitCode = await runCli(["doctor", "--json"], {
    io: {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
    },
    doctor: {
      loadCodexDiagnostics: async () => {
        throw new Error("Bearer fake-secret-token at C:/private/auth.json");
      },
    },
    agents: {integrations: []},
  });

  expect(exitCode).toBe(1);
  expect(output).toEqual([]);
  expect(errors.join("")).toBe("codex-limits: Could not run Codex Limits diagnostics.\n");
  expect(errors.join("")).not.toContain("fake-secret-token");
  expect(errors.join("")).not.toContain("private");
});

test("runCli isolates unsafe agent inspection failures as unknown diagnostics", async () => {
  const output: string[] = [];
  const errors: string[] = [];
  const exitCode = await runCli(["doctor", "--json"], {
    io: {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
    },
    doctor: {
      loadCodexDiagnostics: async () => ({
        codexHomeDetected: false,
        authenticationFound: false,
        localUsageFound: false,
        liveEndpoint: "not-checked",
      }),
    },
    agents: {
      integrations: [
        createDiagnosticIntegration("private-agent", "Private agent", async () => {
          throw new Error("Bearer fake-secret-token at C:/private/auth.json");
        }),
      ],
    },
  });

  expect(exitCode).toBe(0);
  expect(errors).toEqual([]);
  expect(JSON.parse(output.join("")).agentIntegrations).toEqual({
    "private-agent": "unknown",
  });
  expect(output.join("")).not.toContain("fake-secret-token");
  expect(output.join("")).not.toContain("private/auth");
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
  expect(initOutput.join("")).toContain("codex-limits init --pi");
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

test("status output omits usage windows that are not provided", () => {
  const result = createFakeLimitsResult();
  result.windows.fiveHour = null;

  const output = formatStatus(result);

  expect(output).toContain("Weekly usage limit");
  expect(output).not.toContain("5-hour usage limit");
  expect(output).not.toContain("Usage limit: Unknown");
});

test("command formatters do not expose secret-like values", () => {
  const statusOutput = formatStatus({...createFakeLimitsResult(), warnings: ["[redacted]"]});
  const couponsOutput = formatCoupons(unavailableCoupons("https://example.test", ["fake warning"]));
  const availableCouponsOutput = formatCoupons(createFakeCouponResult());

  expect(statusOutput).toContain("Warnings:");
  expect(couponsOutput).toContain("Warnings:");
  expect(availableCouponsOutput).not.toContain("RateLimitResetCredit_test");
});
