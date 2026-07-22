import {expect, test} from "bun:test";
import {homedir} from "node:os";
import {join} from "node:path";
import {AgentInstallError, type AgentIntegration} from "@/agents";
import {runCli} from "@/package/commands/run-cli";
import type {Prompt} from "@/package/commands/runtime";

function createIntegration(
  id = "opencode",
  configPaths = [`/${id}.json`]
): AgentIntegration & {installs: number} {
  return {
    id,
    displayName: id,
    description: `Enable ${id}.`,
    installs: 0,
    async install() {
      this.installs += 1;
      return {changed: true, configPaths};
    },
    async inspect() {
      return "not-installed";
    },
  };
}

test("agents install supports named and all selections", async () => {
  for (const args of [
    ["agents", "install", "opencode"],
    ["agents", "install", "--all"],
  ]) {
    const output: string[] = [];
    const opencode = createIntegration("opencode", ["/opencode.json", "/tui.json"]);
    const exitCode = await runCli(args, {
      io: {stdout: (text) => output.push(text), interactive: false},
      agents: {integrations: [opencode]},
    });

    expect(exitCode).toBe(0);
    expect(opencode.installs).toBe(1);
    expect(output.join("")).toContain("opencode: installed ([path], [path])");
  }
});

test("agent installation safely shortens configuration paths under the user home", async () => {
  const output: string[] = [];
  const configPath = join(homedir(), ".config", "opencode", "opencode.json");
  const opencode = createIntegration("opencode", [configPath]);

  await runCli(["agents", "install", "opencode"], {
    io: {stdout: (text) => output.push(text), interactive: false},
    agents: {integrations: [opencode]},
  });

  expect(output.join("")).toContain("~/.config/opencode/opencode.json");
  expect(output.join("")).not.toContain(homedir());
});

test("agent installation bounds displayed configuration paths", async () => {
  const output: string[] = [];
  const configPaths = Array.from({length: 6}, (_, index) =>
    join(homedir(), ".config", "opencode", `config-${index}.json`)
  );
  const opencode = createIntegration("opencode", configPaths);

  await runCli(["agents", "install", "opencode"], {
    io: {stdout: (text) => output.push(text), interactive: false},
    agents: {integrations: [opencode]},
  });

  expect(output.join("")).toContain("+2 more");
  expect(output.join("")).not.toContain("config-4.json");
});

test("init remains a backward-compatible installation command", async () => {
  for (const args of [
    ["init", "--opencode"],
    ["init", "--all"],
  ]) {
    const output: string[] = [];
    const opencode = createIntegration();
    const exitCode = await runCli(args, {
      io: {stdout: (text) => output.push(text), interactive: false},
      agents: {integrations: [opencode]},
    });

    expect(exitCode).toBe(0);
    expect(opencode.installs).toBe(1);
    expect(output.join("")).toContain("opencode: installed");
  }
});

test("agent installation handles an empty integration registry", async () => {
  const output: string[] = [];
  const exitCode = await runCli(["agents", "install", "--all"], {
    io: {stdout: (text) => output.push(text), interactive: false},
    agents: {integrations: []},
  });

  expect(exitCode).toBe(0);
  expect(output.join("")).toBe("No supported agent integrations are available.\n");
});

test("agent installation handles non-interactive mode without prompting", async () => {
  const output: string[] = [];
  const exitCode = await runCli(["agents", "install"], {
    io: {stdout: (text) => output.push(text), interactive: false},
  });

  expect(exitCode).toBe(0);
  expect(output.join("")).toContain("requires an interactive terminal");
  expect(output.join("")).toContain("agents install opencode");
});

test("shared parsing rejects invalid selections before writing", async () => {
  const cases = [
    {args: ["init", "--bad"], message: "Unknown init option: --bad"},
    {args: ["init", "--opencode", "--opencode"], message: "Duplicate init option"},
    {
      args: ["init", "--all", "--opencode"],
      message: "Init option --all cannot be combined with integration options.",
    },
    {args: ["init", "opencode"], message: "Unexpected init argument: opencode"},
    {args: ["init", "--postinstall"], message: "Unknown init option: --postinstall"},
    {
      args: ["agents", "install", "--all", "opencode"],
      message: "Option --all cannot be combined with agent names.",
    },
    {
      args: ["agents", "install", "opencode", "opencode"],
      message: "Agent integration names cannot be repeated.",
    },
    {
      args: ["agents", "install", "unknown"],
      message: "Unknown agent: unknown",
    },
  ];

  for (const item of cases) {
    const errors: string[] = [];
    const integration = createIntegration();
    const exitCode = await runCli(item.args, {
      io: {stderr: (text) => errors.push(text), interactive: false},
      agents: {integrations: [integration]},
    });

    expect(exitCode, item.args.join(" ")).toBe(1);
    expect(integration.installs).toBe(0);
    expect(errors.join(""), item.args.join(" ")).toContain(item.message);
  }
});

test("interactive installation prompts once per integration", async () => {
  const opencode = createIntegration("opencode");
  const pi = createIntegration("pi");
  const questions: string[] = [];
  let closed = false;
  const prompt = Object.assign(
    async (question: string) => {
      questions.push(question);
      return "y";
    },
    {
      close: () => {
        closed = true;
      },
    }
  ) satisfies Prompt;

  const exitCode = await runCli(["agents", "install"], {
    io: {
      stdout: () => undefined,
      interactive: true,
      createPrompt: () => prompt,
    },
    agents: {integrations: [opencode, pi]},
  });

  expect(exitCode).toBe(0);
  expect(questions).toHaveLength(2);
  expect(questions[0]).toContain("Install opencode?");
  expect(questions[1]).toContain("Install pi?");
  expect(opencode.installs).toBe(1);
  expect(pi.installs).toBe(1);
  expect(closed).toBe(true);
});

test("interactive setup hides prompt creation and answer failures", async () => {
  const creationErrors: string[] = [];
  const creationExitCode = await runCli(["agents", "install"], {
    io: {
      stdout: () => undefined,
      stderr: (text) => creationErrors.push(text),
      interactive: true,
      createPrompt: () => {
        throw new Error("Bearer fake-secret-token at C:/private/config.json");
      },
    },
  });

  expect(creationExitCode).toBe(1);
  expect(creationErrors.join("")).toBe("codex-limits agents install: Interactive setup failed.\n");

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
  const answerExitCode = await runCli(["agents", "install"], {
    io: {
      stdout: () => undefined,
      stderr: (text) => answerErrors.push(text),
      interactive: true,
      createPrompt: () => prompt,
    },
  });

  expect(answerExitCode).toBe(1);
  expect(answerErrors.join("")).toBe("codex-limits agents install: Interactive setup failed.\n");
  expect(closed).toBe(true);
});

test("a prompt close failure does not overwrite successful installation", async () => {
  const errors: string[] = [];
  const opencode = createIntegration();
  const prompt = Object.assign(async () => "y", {
    close: () => {
      throw new Error("close failed");
    },
  }) satisfies Prompt;

  const exitCode = await runCli(["agents", "install"], {
    io: {
      stdout: () => undefined,
      stderr: (text) => errors.push(text),
      interactive: true,
      createPrompt: () => prompt,
    },
    agents: {integrations: [opencode]},
  });

  expect(exitCode).toBe(0);
  expect(opencode.installs).toBe(1);
  expect(errors).toEqual([]);
});

test("interactive installation skips integrations declined by the user", async () => {
  const output: string[] = [];
  const opencode = createIntegration();
  const prompt: Prompt = async () => "n";
  const exitCode = await runCli(["init"], {
    io: {
      stdout: (text) => output.push(text),
      interactive: true,
      createPrompt: () => prompt,
    },
    agents: {integrations: [opencode]},
  });

  expect(exitCode).toBe(0);
  expect(opencode.installs).toBe(0);
  expect(output.join("")).toContain("No integrations installed");
});

test("agent installation hides raw adapter failures and permits safe errors", async () => {
  const rawErrors: string[] = [];
  const rawFailure = createIntegration();
  rawFailure.install = async () => {
    throw new Error("Bearer fake-secret-token at C:/private/config.json");
  };

  const rawExitCode = await runCli(["agents", "install", "opencode"], {
    io: {stderr: (text) => rawErrors.push(text), interactive: false},
    agents: {integrations: [rawFailure]},
  });

  expect(rawExitCode).toBe(1);
  expect(rawErrors.join("")).toBe("opencode: Integration installation failed.\n");

  const safeErrors: string[] = [];
  const safeFailure = createIntegration();
  safeFailure.install = async () => {
    throw new AgentInstallError("Configuration is too large to update safely.");
  };
  const safeExitCode = await runCli(["agents", "install", "opencode"], {
    io: {stderr: (text) => safeErrors.push(text), interactive: false},
    agents: {integrations: [safeFailure]},
  });

  expect(safeExitCode).toBe(1);
  expect(safeErrors.join("")).toBe("opencode: Configuration is too large to update safely.\n");

  const unsafeMarkedErrors: string[] = [];
  const unsafeMarkedFailure = createIntegration();
  unsafeMarkedFailure.install = async () => {
    throw new AgentInstallError("Bearer fake-secret-token at C:/private/config.json");
  };
  await runCli(["agents", "install", "opencode"], {
    io: {stderr: (text) => unsafeMarkedErrors.push(text), interactive: false},
    agents: {integrations: [unsafeMarkedFailure]},
  });

  expect(unsafeMarkedErrors.join("")).toBe("opencode: Integration installation failed.\n");
});

test("output failures are not misreported as adapter installation failures", async () => {
  const errors: string[] = [];
  const opencode = createIntegration();
  const exitCode = await runCli(["agents", "install", "opencode"], {
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
  expect(opencode.installs).toBe(1);
  expect(errors.join("")).toBe("codex-limits: Could not install agent integrations.\n");
});
