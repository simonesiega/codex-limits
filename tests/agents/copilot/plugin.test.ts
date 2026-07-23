import {expect, test} from "bun:test";
import type {JoinSessionConfig} from "@github/copilot-sdk/extension";
import startCopilotExtension, {
  COPILOT_EXTENSION_MARKER,
  startCopilotExtension as startExtension,
} from "@/agents/copilot/plugin";
import {createFakeLimitsResult} from "@tests/package/fixtures/fake-results";

type RegisteredCommand = NonNullable<JoinSessionConfig["commands"]>[number];

const COMMAND_CONTEXT = {
  sessionId: "test-session",
  command: "/codex-limits",
  commandName: "codex-limits",
  args: "",
};

async function register(
  options: {
    getLimits?: () => Promise<ReturnType<typeof createFakeLimitsResult>>;
    log?: (message: string, settings?: {level?: string; ephemeral?: boolean}) => Promise<void>;
  } = {}
): Promise<{
  command: RegisteredCommand;
  logs: Array<{message: string; settings?: {level?: string; ephemeral?: boolean}}>;
  sentMessages: number;
}> {
  let command: RegisteredCommand | undefined;
  let sentMessages = 0;
  const logs: Array<{
    message: string;
    settings?: {level?: string; ephemeral?: boolean};
  }> = [];

  await startExtension({
    getLimits: options.getLimits ?? (async () => createFakeLimitsResult()),
    joinSession: async (configuration) => {
      command = configuration.commands[0];
      return {
        log:
          options.log ??
          (async (message, settings) => {
            logs.push({message, ...(settings ? {settings} : {})});
          }),
        send: () => {
          sentMessages += 1;
        },
      };
    },
  });

  if (!command) {
    throw new Error("Copilot command was not registered.");
  }
  return {
    command,
    logs,
    get sentMessages() {
      return sentMessages;
    },
  };
}

test("Copilot extension registers /codex-limits and logs shared limits without an LLM prompt", async () => {
  const registered = await register();

  await registered.command.handler(COMMAND_CONTEXT);

  expect(startCopilotExtension).toBe(startExtension);
  expect(COPILOT_EXTENSION_MARKER).toBe("codex-limits-copilot-extension-v1");
  expect(registered.command.name).toBe("codex-limits");
  expect(registered.command.description).toContain("Codex limits");
  expect(registered.logs).toHaveLength(1);
  expect(registered.logs[0]?.message).toContain("93% remaining");
  expect(registered.logs[0]?.message).toContain("Reset credits");
  expect(registered.logs[0]?.settings).toBeUndefined();
  expect(registered.sentMessages).toBe(0);
});

test("Copilot extension presents a safe static loading error", async () => {
  const registered = await register({
    getLimits: async () => {
      throw new Error("Bearer fake-secret-token at C:/private/auth.json");
    },
  });

  await registered.command.handler(COMMAND_CONTEXT);

  expect(registered.logs).toEqual([
    {message: "Could not load Codex limits.", settings: {level: "error"}},
  ]);
  expect(JSON.stringify(registered.logs)).not.toContain("fake-secret-token");
  expect(JSON.stringify(registered.logs)).not.toContain("private");
  expect(registered.sentMessages).toBe(0);
});

test("Copilot extension hides timeline failures", async () => {
  const registered = await register({
    log: async () => {
      throw new Error("Bearer fake-secret-token at C:/private/copilot.json");
    },
  });

  let message = "";
  try {
    await registered.command.handler(COMMAND_CONTEXT);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  expect(message).toBe("Could not display Codex limits.");
  expect(message).not.toContain("fake-secret-token");
  expect(message).not.toContain("private");
});
