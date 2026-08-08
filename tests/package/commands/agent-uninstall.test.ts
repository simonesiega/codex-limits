import {expect, test} from "bun:test";
import {AgentUninstallError, type AgentIntegration, type AgentIntegrationStatus} from "@/agents";
import {runCli} from "@/package/commands/run-cli";
import type {Prompt} from "@/package/commands/runtime";

function createIntegration(
  id: string,
  status: AgentIntegrationStatus = "installed",
  changed = true
): AgentIntegration & {uninstalls: number; inspections: number} {
  return {
    id,
    displayName: id,
    description: `Enable ${id}.`,
    uninstalls: 0,
    inspections: 0,
    async install() {
      return {changed: false};
    },
    async uninstall() {
      this.uninstalls += 1;
      return {changed};
    },
    async inspect() {
      this.inspections += 1;
      return status;
    },
  };
}

test("agents uninstall supports named and all selections", async () => {
  const namedOutput: string[] = [];
  const opencode = createIntegration("opencode");
  const namedExitCode = await runCli(["agents", "uninstall", "opencode"], {
    io: {stdout: (text) => namedOutput.push(text), interactive: false},
    agents: {integrations: [opencode]},
  });

  expect(namedExitCode).toBe(0);
  expect(opencode.uninstalls).toBe(1);
  expect(namedOutput.join("")).toContain("opencode: uninstalled");
  expect(namedOutput.join("")).toContain("Restart the target agent terminal");

  const allOutput: string[] = [];
  const pi = createIntegration("pi", "not-installed", false);
  const allExitCode = await runCli(["agents", "uninstall", "--all"], {
    io: {stdout: (text) => allOutput.push(text), interactive: false},
    agents: {integrations: [opencode, pi]},
  });

  expect(allExitCode).toBe(0);
  expect(opencode.uninstalls).toBe(2);
  expect(pi.uninstalls).toBe(1);
  expect(allOutput.join("")).toContain("pi: not installed");
});

test("interactive uninstall prompts only for integrations known to be installed", async () => {
  const opencode = createIntegration("opencode", "installed");
  const pi = createIntegration("pi", "not-installed");
  const copilot = createIntegration("copilot", "unknown");
  copilot.inspect = async () => {
    throw new Error("Bearer fake-secret-token at C:/private/config.json");
  };
  const questions: string[] = [];
  let closed = false;
  const prompt = Object.assign(
    async (question: string) => {
      questions.push(question);
      return "yes";
    },
    {
      close: () => {
        closed = true;
      },
    }
  ) satisfies Prompt;

  const exitCode = await runCli(["agents", "uninstall"], {
    io: {stdout: () => undefined, interactive: true, createPrompt: () => prompt},
    agents: {integrations: [opencode, pi, copilot]},
  });

  expect(exitCode).toBe(0);
  expect(questions).toEqual(["Uninstall opencode? [y/N] "]);
  expect(opencode.uninstalls).toBe(1);
  expect(pi.uninstalls).toBe(0);
  expect(copilot.uninstalls).toBe(0);
  expect(closed).toBe(true);
});

test("interactive uninstall is conservative when nothing is selected or installed", async () => {
  const installed = createIntegration("opencode");
  const declinedOutput: string[] = [];
  const declinedExitCode = await runCli(["agents", "uninstall"], {
    io: {
      stdout: (text) => declinedOutput.push(text),
      interactive: true,
      createPrompt: () => async () => "",
    },
    agents: {integrations: [installed]},
  });

  expect(declinedExitCode).toBe(0);
  expect(installed.uninstalls).toBe(0);
  expect(declinedOutput.join("")).toContain("No integrations uninstalled");

  const absentOutput: string[] = [];
  const absent = createIntegration("pi", "not-installed");
  const absentExitCode = await runCli(["agents", "uninstall"], {
    io: {stdout: (text) => absentOutput.push(text), interactive: true},
    agents: {integrations: [absent]},
  });
  expect(absentExitCode).toBe(0);
  expect(absentOutput.join("")).toBe(
    "No agent integrations were safely recognized as installed.\n"
  );
});

test("agents uninstall handles an empty integration registry", async () => {
  const output: string[] = [];
  const exitCode = await runCli(["agents", "uninstall", "--all"], {
    io: {stdout: (text) => output.push(text), interactive: false},
    agents: {integrations: []},
  });

  expect(exitCode).toBe(0);
  expect(output.join("")).toBe("No supported agent integrations are available.\n");
});

test("agents uninstall requires explicit targets in non-interactive mode", async () => {
  const output: string[] = [];
  const exitCode = await runCli(["agents", "uninstall"], {
    io: {stdout: (text) => output.push(text), interactive: false},
  });

  expect(exitCode).toBe(0);
  expect(output.join("")).toContain("requires an interactive terminal");
  expect(output.join("")).toContain("agents uninstall opencode");
});

test("interactive uninstall hides prompt creation and answer failures", async () => {
  const creationErrors: string[] = [];
  const creationExitCode = await runCli(["agents", "uninstall"], {
    io: {
      stdout: () => undefined,
      stderr: (text) => creationErrors.push(text),
      interactive: true,
      createPrompt: () => {
        throw new Error("Bearer fake-secret-token at C:/private/config.json");
      },
    },
    agents: {integrations: [createIntegration("opencode")]},
  });

  expect(creationExitCode).toBe(1);
  expect(creationErrors.join("")).toBe(
    "codex-limits agents uninstall: Interactive removal failed.\n"
  );

  const answerErrors: string[] = [];
  let closed = false;
  const prompt = Object.assign(
    async () => {
      throw new Error("Bearer fake-secret-token at C:/private/config.json");
    },
    {
      close: () => {
        closed = true;
      },
    }
  ) satisfies Prompt;
  const answerExitCode = await runCli(["agents", "uninstall"], {
    io: {
      stdout: () => undefined,
      stderr: (text) => answerErrors.push(text),
      interactive: true,
      createPrompt: () => prompt,
    },
    agents: {integrations: [createIntegration("opencode")]},
  });

  expect(answerExitCode).toBe(1);
  expect(answerErrors.join("")).toBe(
    "codex-limits agents uninstall: Interactive removal failed.\n"
  );
  expect(closed).toBe(true);
});

test("uninstall output failures are reported by the command router", async () => {
  const errors: string[] = [];
  const opencode = createIntegration("opencode");
  const exitCode = await runCli(["agents", "uninstall", "opencode"], {
    io: {
      stdout: () => {
        throw new Error("output failed");
      },
      stderr: (text) => errors.push(text),
      interactive: false,
    },
    agents: {integrations: [opencode]},
  });

  expect(exitCode).toBe(1);
  expect(opencode.uninstalls).toBe(1);
  expect(errors.join("")).toBe("codex-limits: Could not uninstall agent integrations.\n");
});

test("multiple uninstall failures are isolated and safely reported", async () => {
  const errors: string[] = [];
  const output: string[] = [];
  const opencode = createIntegration("opencode");
  opencode.uninstall = async () => {
    throw new AgentUninstallError("OpenCode configuration is malformed.");
  };
  const pi = createIntegration("pi");
  const copilot = createIntegration("copilot");
  copilot.uninstall = async () => {
    throw new Error("Bearer fake-secret-token at C:/private/config.json");
  };
  const unsafe = createIntegration("unsafe");
  unsafe.uninstall = async () => {
    throw new AgentUninstallError("Bearer marked-secret-token at C:/private/settings.json");
  };

  const exitCode = await runCli(["agents", "uninstall", "opencode", "pi", "copilot", "unsafe"], {
    io: {
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
      interactive: false,
    },
    agents: {integrations: [opencode, pi, copilot, unsafe]},
  });

  expect(exitCode).toBe(1);
  expect(pi.uninstalls).toBe(1);
  expect(output.join("")).toContain("pi: uninstalled");
  expect(errors.join("")).toContain("opencode: OpenCode configuration is malformed.");
  expect(errors.join("")).toContain("copilot: Integration uninstallation failed.");
  expect(errors.join("")).toContain("unsafe: Integration uninstallation failed.");
  expect(errors.join("")).not.toContain("fake-secret-token");
  expect(errors.join("")).not.toContain("marked-secret-token");
});
