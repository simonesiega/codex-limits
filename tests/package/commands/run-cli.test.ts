/**
 * @fileoverview Behavioral coverage for run cli. The cases document the supported contract and isolate filesystem, network, or host state where applicable.
 */
import {expect, test} from "bun:test";
import type {AgentIntegration} from "@/agents";
import {runCli} from "@/package/commands/run-cli";
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
    async uninstall() {
      return {changed: false};
    },
    inspect,
  };
}

function expectedCouponJson() {
  return {
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
  };
}

test("runCli passes loaded limits to the default TUI command", async () => {
  const result = createFakeLimitsResult();
  const rendered: Array<typeof result> = [];
  const exitCode = await runCli([], {
    usage: {loadLimits: async () => result},
    ui: {
      renderDashboard: (loaded) => {
        rendered.push(loaded);
      },
    },
  });

  expect(exitCode).toBe(0);
  expect(rendered).toEqual([result]);
});

test("runCli preserves the complete limits JSON contract", async () => {
  const output: string[] = [];
  const errors: string[] = [];
  const result = createFakeLimitsResult();
  const exitCode = await runCli(["--json"], {
    io: {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
    },
    usage: {loadLimits: async () => result},
  });

  const parsed = JSON.parse(output.join(""));
  expect(exitCode).toBe(0);
  expect(errors).toEqual([]);
  expect(parsed).toEqual({
    windows: result.windows,
    coupons: expectedCouponJson(),
    warnings: [],
  });
  expect(Object.keys(parsed as object)).toEqual(["windows", "coupons", "warnings"]);
  expect(output.join("")).not.toContain("RateLimitResetCredit_test");
  expect(output.join("")).not.toContain("codex_rate_limits");
});

test("runCli returns deterministic usage-threshold exit codes at boundaries", async () => {
  const cases = [
    {name: "equal boundary", threshold: "five-hour=93", expectedExitCode: 0},
    {name: "below boundary", threshold: "five-hour=93.1", expectedExitCode: 2},
  ];

  for (const item of cases) {
    const output: string[] = [];
    const errors: string[] = [];
    const exitCode = await runCli(["status", "--threshold", item.threshold], {
      io: {
        stdout: (text) => output.push(text),
        stderr: (text) => errors.push(text),
      },
      usage: {loadLimits: async () => createFakeLimitsResult()},
    });

    expect(exitCode, item.name).toBe(item.expectedExitCode);
    expect(output.join(""), item.name).toContain("Usage Limits");
    expect(errors, item.name).toEqual([]);
  }
});

test("runCli preserves JSON when a configured usage threshold is unavailable", async () => {
  const output: string[] = [];
  const errors: string[] = [];
  const result = createFakeLimitsResult();
  result.windows.weekly = null;

  const exitCode = await runCli(["--json", "--threshold", "weekly=0"], {
    io: {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
    },
    usage: {loadLimits: async () => result},
  });

  expect(exitCode).toBe(3);
  expect(errors).toEqual([]);
  expect(JSON.parse(output.join(""))).toEqual({
    windows: result.windows,
    coupons: expectedCouponJson(),
    warnings: [],
  });
});

test("runCli keeps threshold JSON machine-readable when the condition is breached", async () => {
  const output: string[] = [];
  const errors: string[] = [];
  const result = createFakeLimitsResult();

  const exitCode = await runCli(
    ["--json", "--threshold", "five-hour=50", "--threshold", "weekly=12"],
    {
      io: {
        stdout: (text) => output.push(text),
        stderr: (text) => errors.push(text),
      },
      usage: {loadLimits: async () => result},
    }
  );

  expect(exitCode).toBe(2);
  expect(errors).toEqual([]);
  expect(JSON.parse(output.join(""))).toEqual({
    windows: result.windows,
    coupons: expectedCouponJson(),
    warnings: [],
  });
});

test("runCli rejects invalid thresholds before loading usage data", async () => {
  const cases = [
    ["status", "--threshold", "weekly=101"],
    ["--json", "--threshold", "private=fake-secret-token"],
    ["status", "--threshold", "weekly=10", "--threshold", "weekly=20"],
  ];

  for (const args of cases) {
    const output: string[] = [];
    const errors: string[] = [];
    let loads = 0;
    const exitCode = await runCli(args, {
      io: {
        stdout: (text) => output.push(text),
        stderr: (text) => errors.push(text),
      },
      usage: {
        loadLimits: async () => {
          loads += 1;
          return createFakeLimitsResult();
        },
      },
    });

    expect(exitCode, args.join(" ")).toBe(1);
    expect(loads, args.join(" ")).toBe(0);
    expect(output, args.join(" ")).toEqual([]);
    expect(errors.join(""), args.join(" ")).toContain("--threshold");
    expect(errors.join(""), args.join(" ")).not.toContain("fake-secret-token");
  }
});

test("runCli preserves the complete coupon JSON contract", async () => {
  const output: string[] = [];
  const errors: string[] = [];
  const exitCode = await runCli(["coupons", "--json"], {
    io: {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
    },
    coupons: {loadCoupons: async () => createFakeCouponResult()},
  });

  expect(exitCode).toBe(0);
  expect(errors).toEqual([]);
  expect(JSON.parse(output.join(""))).toEqual(expectedCouponJson());
  expect(output.join("")).not.toContain("RateLimitResetCredit_test");
  expect(output.join("")).not.toContain("codex_rate_limits");
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
      createDiagnosticIntegration("copilot", "GitHub Copilot CLI", async () => "installed"),
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
      "Package version:                0.1.3",
      "Node.js version:                22.0.0",
      "Operating system:               Windows",
      "Codex home detected:            Yes",
      "Authentication found:           Yes",
      "Local usage found:              Yes",
      "Live endpoint:                  Reachable",
      "OpenCode integration:           Installed",
      "pi integration:                 Installed",
      "GitHub Copilot CLI integration: Installed",
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
      copilot: "installed",
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

test("runCli routes plain-text usage commands", async () => {
  const cases = [
    {
      args: ["status"],
      expected: "Usage Limits",
      overrides: {usage: {loadLimits: async () => createFakeLimitsResult()}},
    },
    {
      args: ["coupons"],
      expected: "Reset Coupons",
      overrides: {coupons: {loadCoupons: async () => createFakeCouponResult()}},
    },
  ];

  for (const item of cases) {
    const output: string[] = [];
    const exitCode = await runCli(item.args, {
      io: {stdout: (text) => output.push(text)},
      ...item.overrides,
    });

    expect(exitCode, item.args[0]).toBe(0);
    expect(output.join(""), item.args[0]).toContain(item.expected);
  }
});

test("runCli prints generated root help", async () => {
  const output: string[] = [];

  const exitCode = await runCli(["--help"], {io: {stdout: (text) => output.push(text)}});

  expect(exitCode).toBe(0);
  expect(output.join("")).toContain("codex-limits status");
  expect(output.join("")).toContain("agents");
});

test("runCli prints the configured package version", async () => {
  const output: string[] = [];

  const exitCode = await runCli(["--version"], {
    io: {stdout: (text) => output.push(text)},
    packageInfo: {version: "9.9.9"},
  });

  expect(exitCode).toBe(0);
  expect(output.join("")).toBe("9.9.9\n");
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

  expect(agentsOutput.join("")).toContain("install    Install optional agent integrations");
  expect(agentsOutput.join("")).toContain(
    "uninstall  Safely uninstall optional agent integrations"
  );
  expect(installOutput.join("")).toContain("[<agent...>]");
  expect(initOutput.join("")).toContain("codex-limits init --opencode");
  expect(initOutput.join("")).toContain("codex-limits init --pi");
  expect(initOutput.join("")).toContain("codex-limits init --copilot");
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
