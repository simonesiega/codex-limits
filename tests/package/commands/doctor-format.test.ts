/**
 * @fileoverview Behavioral coverage for doctor format. The cases document the supported contract and isolate filesystem, network, or host state where applicable.
 */
import {expect, test} from "bun:test";
import {formatDoctor} from "@/package/commands/doctor/format";

test("formatDoctor labels unavailable and unknown diagnostic states", () => {
  const output = formatDoctor(
    {
      packageVersion: "1.3.0",
      nodeVersion: "20.0.0",
      operatingSystem: "Linux",
      codexHomeDetected: false,
      authenticationFound: false,
      localUsageFound: false,
      liveEndpoint: "unreachable",
      agentIntegrations: {
        opencode: "not-installed",
        pi: "unknown",
      },
    },
    [
      {id: "opencode", displayName: "OpenCode"},
      {id: "pi", displayName: "pi"},
      {id: "copilot", displayName: "GitHub Copilot CLI"},
    ]
  );

  expect(output).toContain("Codex home detected:            No");
  expect(output).toContain("Authentication found:           No");
  expect(output).toContain("Local usage found:              No");
  expect(output).toContain("Live endpoint:                  Unreachable");
  expect(output).toContain("OpenCode integration:           Not installed");
  expect(output).toContain("pi integration:                 Unknown");
  expect(output).toContain("GitHub Copilot CLI integration: Unknown");
});

test("formatDoctor labels an endpoint that was not checked", () => {
  const output = formatDoctor(
    {
      packageVersion: "1.3.0",
      nodeVersion: "20.0.0",
      operatingSystem: "Linux",
      codexHomeDetected: false,
      authenticationFound: false,
      localUsageFound: false,
      liveEndpoint: "not-checked",
      agentIntegrations: {},
    },
    []
  );

  expect(output).toContain("Live endpoint:        Not checked");
});
