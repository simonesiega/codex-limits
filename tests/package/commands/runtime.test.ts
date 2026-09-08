/**
 * @fileoverview Behavioral coverage for the production CLI runtime and its lazy terminal resources.
 */
import {expect, spyOn, test} from "bun:test";
import {createCliRuntime} from "@/package/commands/runtime";
import {createFakeLimitsResult} from "@tests/package/fixtures/fake-results";

test("createCliRuntime writes output through the production stdout stream", () => {
  const write = spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const runtime = createCliRuntime();

    runtime.io.stdout("Codex Limits\n");

    expect(write).toHaveBeenCalledWith("Codex Limits\n");
  } finally {
    write.mockRestore();
  }
});

test("createCliRuntime loads and delegates to the dashboard only when requested", async () => {
  const result = createFakeLimitsResult();
  const rendered: (typeof result)[] = [];
  let loads = 0;
  const runtime = createCliRuntime({}, async () => {
    loads += 1;
    return {
      renderApp: async (loaded) => {
        rendered.push(loaded);
      },
    };
  });

  expect(loads).toBe(0);

  await runtime.ui.renderDashboard(result);

  expect(loads).toBe(1);
  expect(rendered).toEqual([result]);
});

test("createCliRuntime creates a terminal prompt that can be closed without asking a question", async () => {
  const runtime = createCliRuntime();
  const prompt = runtime.io.createPrompt();

  try {
    expect(prompt.close).toBeFunction();
  } finally {
    await prompt.close?.();
  }
});
