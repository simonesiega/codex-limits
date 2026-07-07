import { expect, test } from "bun:test";
import type { AgentIntegration } from "../../../src/agents";
import { runInit } from "../../../src/package/commands/init";

function createIntegration(id = "opencode", configPaths = [`/${id}.json`]): AgentIntegration & { installs: number } {
  return {
    id,
    name: id,
    description: `Enable ${id}.`,
    installs: 0,
    async install() {
      this.installs += 1;
      return { changed: true, configPaths };
    },
  };
}

test("runInit prints help", async () => {
  const output: string[] = [];
  const exitCode = await runInit(["--help"], { stdout: (text) => output.push(text), interactive: false });

  expect(exitCode).toBe(0);
  expect(output.join("")).toContain("codex-limits init --opencode");
});

test("runInit installs all selected integrations", async () => {
  const output: string[] = [];
  const opencode = createIntegration("opencode", ["/opencode.json", "/tui.json"]);
  const exitCode = await runInit(["--all"], { stdout: (text) => output.push(text), interactive: false, integrations: [opencode] });

  expect(exitCode).toBe(0);
  expect(opencode.installs).toBe(1);
  expect(output.join("")).toContain("opencode: installed (/opencode.json, /tui.json)");
});

test("runInit installs opencode directly", async () => {
  const output: string[] = [];
  const opencode = createIntegration("opencode");
  const exitCode = await runInit(["--opencode"], { stdout: (text) => output.push(text), interactive: false, integrations: [opencode] });

  expect(exitCode).toBe(0);
  expect(opencode.installs).toBe(1);
  expect(output.join("")).toContain("opencode: installed");
});

test("runInit handles non-interactive mode without prompting", async () => {
  const output: string[] = [];
  const exitCode = await runInit([], { stdout: (text) => output.push(text), interactive: false });

  expect(exitCode).toBe(0);
  expect(output.join("")).toContain("requires an interactive terminal");
});

test("runInit rejects unknown options", async () => {
  const errors: string[] = [];
  const exitCode = await runInit(["--bad"], { stderr: (text) => errors.push(text), interactive: false });

  expect(exitCode).toBe(1);
  expect(errors.join("")).toContain("Unknown init option: --bad");
});

test("runInit rejects unknown options before installing selected integrations", async () => {
  const errors: string[] = [];
  const opencode = createIntegration("opencode");

  for (const args of [["--all", "--bad"], ["--opencode", "--bad"]]) {
    const exitCode = await runInit(args, { stderr: (text) => errors.push(text), interactive: false, integrations: [opencode] });

    expect(exitCode).toBe(1);
  }

  expect(opencode.installs).toBe(0);
  expect(errors.join("")).toContain("Unknown init option: --bad");
});

test("runInit prompt installs integration for blank or yes answers", async () => {
  for (const answer of ["", "y"]) {
    const opencode = createIntegration("opencode");
    const exitCode = await runInit([], { stdout: () => undefined, prompt: async () => answer, interactive: true, integrations: [opencode] });

    expect(exitCode).toBe(0);
    expect(opencode.installs).toBe(1);
  }
});

test("runInit prompt skips integration for no answer", async () => {
  const output: string[] = [];
  const opencode = createIntegration("opencode");
  const exitCode = await runInit([], { stdout: (text) => output.push(text), prompt: async () => "n", interactive: true, integrations: [opencode] });

  expect(exitCode).toBe(0);
  expect(opencode.installs).toBe(0);
  expect(output.join("")).toContain("No integrations installed");
});

test("runInit prompts once per integration", async () => {
  const opencode = createIntegration("opencode");
  const pi = createIntegration("pi");
  const questions: string[] = [];
  const exitCode = await runInit([], {
    stdout: () => undefined,
    prompt: async (question) => {
      questions.push(question);
      return "y";
    },
    interactive: true,
    integrations: [opencode, pi],
  });

  expect(exitCode).toBe(0);
  expect(questions).toHaveLength(2);
  expect(questions[0]).toContain("Install opencode?");
  expect(questions[1]).toContain("Install pi?");
  expect(opencode.installs).toBe(1);
  expect(pi.installs).toBe(1);
});
