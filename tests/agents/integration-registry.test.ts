import {expect, test} from "bun:test";
import {access} from "node:fs/promises";
import {resolve} from "node:path";
import {AGENT_INTEGRATIONS} from "@/agents";

const REQUIRED_ADAPTER_FILES = ["format.ts", "install.ts", "integration.ts", "plugin.ts"];

test("registered agents expose the shared adapter contract and layout", async () => {
  const ids = AGENT_INTEGRATIONS.map((integration) => integration.id);
  expect(ids).toContain("opencode");
  expect(ids).toContain("pi");
  expect(ids).toContain("copilot");
  expect(new Set(ids).size).toBe(ids.length);

  for (const integration of AGENT_INTEGRATIONS) {
    expect(integration.displayName.length).toBeGreaterThan(0);
    expect(typeof integration.install).toBe("function");
    expect(typeof integration.inspect).toBe("function");

    await Promise.all([
      ...REQUIRED_ADAPTER_FILES.map((file) =>
        access(resolve(import.meta.dir, "../../src/agents", integration.id, file))
      ),
      access(resolve(import.meta.dir, "../../src/package", `${integration.id}.ts`)),
    ]);
  }
});
