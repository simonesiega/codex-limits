import {expect, test} from "bun:test";
import {type Component, visibleWidth} from "@earendil-works/pi-tui";
import plugin, {createPiPlugin} from "@/agents/pi/plugin";
import {createFakeLimitsResult} from "@tests/package/fixtures/fake-results";

interface RegisteredCommand {
  description?: string;
  handler: (args: string, context: unknown) => Promise<void>;
}

function register(localPlugin: ReturnType<typeof createPiPlugin>): {
  command: RegisteredCommand;
  commandName: string;
  sentMessages: number;
} {
  let command: RegisteredCommand | undefined;
  let commandName = "";
  let sentMessages = 0;
  localPlugin({
    registerCommand: (name: string, definition: RegisteredCommand) => {
      commandName = name;
      command = definition;
    },
    sendUserMessage: () => {
      sentMessages += 1;
    },
  } as never);

  if (!command) {
    throw new Error("Pi command was not registered.");
  }
  return {
    command,
    commandName,
    get sentMessages() {
      return sentMessages;
    },
  };
}

function createTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

test("pi plugin registers /codex-limits and loads the shared core without an LLM prompt", async () => {
  const registered = register(createPiPlugin({getLimits: async () => createFakeLimitsResult()}));
  const statuses: Array<string | undefined> = [];
  const notifications: Array<{message: string; level: string}> = [];
  let rendered = "";
  let respectsNarrowWidth = false;
  let closed = false;
  let overlayOptions: unknown;

  await registered.command.handler("", {
    hasUI: true,
    mode: "tui",
    ui: {
      setStatus: (_id: string, value: string | undefined) => statuses.push(value),
      notify: (message: string, level: string) => notifications.push({message, level}),
      custom: async (
        factory: (
          tui: unknown,
          theme: ReturnType<typeof createTheme>,
          keybindings: unknown,
          done: (value: undefined) => void
        ) => Component,
        options: {overlayOptions?: unknown}
      ) => {
        overlayOptions = options.overlayOptions;
        const component = factory({}, createTheme(), {}, () => {
          closed = true;
        });
        rendered = component.render(56).join("\n");
        respectsNarrowWidth = component.render(20).every((line) => visibleWidth(line) <= 20);
        component.handleInput?.("\r");
      },
    },
  } as never);

  expect(typeof plugin).toBe("function");
  expect(registered.commandName).toBe("codex-limits");
  expect(registered.command.description).toContain("Codex limits");
  expect(statuses).toEqual(["Loading Codex limits...", undefined]);
  expect(notifications).toEqual([]);
  expect(rendered).toContain("Codex Limits");
  expect(rendered).toContain("93% remaining");
  expect(rendered).toContain("Reset credits");
  expect(rendered).toContain("Press Enter or Esc to close");
  expect(respectsNarrowWidth).toBe(true);
  expect(overlayOptions).toEqual({width: 56, minWidth: 36, maxHeight: "90%", margin: 1});
  expect(closed).toBe(true);
  expect(registered.sentMessages).toBe(0);
});

test("pi plugin presents a safe static loading error", async () => {
  const registered = register(
    createPiPlugin({
      getLimits: async () => {
        throw new Error("Bearer fake-secret-token at C:/private/auth.json");
      },
    })
  );
  const notifications: Array<{message: string; level: string}> = [];
  let rendered = "";

  await registered.command.handler("", {
    hasUI: true,
    mode: "tui",
    ui: {
      setStatus: () => undefined,
      notify: (message: string, level: string) => notifications.push({message, level}),
      custom: async (
        factory: (
          tui: unknown,
          theme: ReturnType<typeof createTheme>,
          keybindings: unknown,
          done: (value: undefined) => void
        ) => Component
      ) => {
        rendered = factory({}, createTheme(), {}, () => undefined)
          .render(56)
          .join("\n");
      },
    },
  } as never);

  expect(rendered).toContain("Could not load Codex limits.");
  expect(notifications).toEqual([{message: "Could not load Codex limits.", level: "error"}]);
  expect(JSON.stringify({rendered, notifications})).not.toContain("fake-secret-token");
  expect(JSON.stringify({rendered, notifications})).not.toContain("private");
});

test("pi plugin hides custom UI failures", async () => {
  const registered = register(createPiPlugin({getLimits: async () => createFakeLimitsResult()}));
  const notifications: Array<{message: string; level: string}> = [];

  await registered.command.handler("", {
    hasUI: true,
    mode: "tui",
    ui: {
      setStatus: () => undefined,
      notify: (message: string, level: string) => notifications.push({message, level}),
      custom: async () => {
        throw new Error("Bearer fake-secret-token at C:/private/pi.json");
      },
    },
  } as never);

  expect(notifications).toEqual([{message: "Could not display Codex limits.", level: "error"}]);
  expect(JSON.stringify(notifications)).not.toContain("fake-secret-token");
  expect(JSON.stringify(notifications)).not.toContain("private");
});

test("pi plugin skips data loading outside the interactive TUI", async () => {
  let loads = 0;
  const registered = register(
    createPiPlugin({
      getLimits: async () => {
        loads += 1;
        return createFakeLimitsResult();
      },
    })
  );

  for (const context of [
    {hasUI: false, mode: "print", ui: {}},
    {hasUI: false, mode: "json", ui: {}},
    {hasUI: true, mode: "rpc", ui: {}},
  ]) {
    await registered.command.handler("", context as never);
  }

  expect(loads).toBe(0);
});
