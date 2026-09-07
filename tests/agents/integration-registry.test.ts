/**
 * @fileoverview Behavioral coverage for integration registry. The cases document the supported contract and isolate filesystem, network, or host state where applicable.
 */
import {expect, test} from "bun:test";
import {AGENT_INTEGRATIONS} from "@/agents";

test("registered agents expose a unique shared adapter contract", () => {
  const ids = AGENT_INTEGRATIONS.map((integration) => integration.id);
  expect(ids).toContain("opencode");
  expect(ids).toContain("pi");
  expect(ids).toContain("copilot");
  expect(new Set(ids).size).toBe(ids.length);

  for (const integration of AGENT_INTEGRATIONS) {
    expect(integration.displayName.length).toBeGreaterThan(0);
    expect(typeof integration.install).toBe("function");
    expect(typeof integration.uninstall).toBe("function");
    expect(typeof integration.inspect).toBe("function");
  }
});
