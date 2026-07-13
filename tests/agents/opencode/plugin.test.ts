import {expect, test} from "bun:test";
import plugin, {createOpencodePlugin} from "@/agents/opencode/plugin";
import {createFakeLimitsResult} from "../../package/fixtures/fake-results";

test("opencode plugin registers the slash command through legacy command api", async () => {
  const commands: Array<{slash?: {name: string}; value: string}> = [];
  let disposed = false;

  await plugin.tui(
    {
      command: {
        register: (callback: () => Array<{slash?: {name: string}; value: string}>) => {
          commands.push(...callback());
          return () => {
            disposed = true;
          };
        },
      },
      lifecycle: {
        onDispose: (fn: () => void) => {
          fn();
          return () => undefined;
        },
      },
      ui: {
        dialog: {},
      },
    } as never,
    undefined,
    {} as never
  );

  expect(commands).toHaveLength(1);
  expect(commands[0]?.value).toBe("codex-limits.show");
  expect(commands[0]?.slash?.name).toBe("codex-limits");
  expect(disposed).toBe(true);
});

test("opencode plugin prefers the current keymap command api", async () => {
  const layers: Array<{
    commands: Array<{
      namespace: string;
      name: string;
      title: string;
      desc?: string;
      slashName?: string;
    }>;
    bindings: never[];
  }> = [];
  let legacyRegistrations = 0;
  let disposeCount = 0;

  await plugin.tui(
    {
      command: {
        register: () => {
          legacyRegistrations += 1;
          return () => undefined;
        },
      },
      keymap: {
        registerLayer: (layer: (typeof layers)[number]) => {
          layers.push(layer);
          return () => {
            disposeCount += 1;
          };
        },
      },
      lifecycle: {
        onDispose: (fn: () => void) => {
          fn();
          return () => undefined;
        },
      },
      ui: {
        dialog: {},
      },
    } as never,
    undefined,
    {} as never
  );

  expect(legacyRegistrations).toBe(0);
  expect(layers).toHaveLength(1);
  expect(layers[0]?.commands[0]?.namespace).toBe("palette");
  expect(layers[0]?.commands[0]?.name).toBe("codex-limits.show");
  expect(layers[0]?.commands[0]?.slashName).toBe("codex-limits");
  expect(disposeCount).toBe(1);
});

test("opencode plugin reports a safe registration failure", async () => {
  const localPlugin = createOpencodePlugin();
  const api = {
    keymap: {
      registerLayer: () => {
        throw new Error("private registration detail");
      },
    },
    lifecycle: {onDispose: () => () => undefined},
    ui: {dialog: {}},
  } as never;

  await expect(localPlugin.tui(api, undefined, {} as never)).rejects.toThrow(
    "Could not register the codex-limits OpenCode command."
  );
});

test("opencode plugin cleans up when lifecycle registration fails", async () => {
  const localPlugin = createOpencodePlugin();
  let disposeCount = 0;
  const api = {
    command: {
      register: () => () => {
        disposeCount += 1;
      },
    },
    keymap: {
      registerLayer: () => () => {
        disposeCount += 1;
      },
    },
    lifecycle: {
      onDispose: () => {
        throw new Error("private lifecycle detail");
      },
    },
    ui: {dialog: {}},
  } as never;

  await expect(localPlugin.tui(api, undefined, {} as never)).rejects.toThrow(
    "Could not register the codex-limits OpenCode lifecycle."
  );
  expect(disposeCount).toBe(1);
});

test("opencode registration and disposal are idempotent for the same API", async () => {
  const localPlugin = createOpencodePlugin();
  let commandRegistrations = 0;
  let layerRegistrations = 0;
  let commandDisposals = 0;
  let layerDisposals = 0;
  let disposeLifecycle: (() => void) | undefined;
  const api = {
    command: {
      register: () => {
        commandRegistrations += 1;
        return () => {
          commandDisposals += 1;
        };
      },
    },
    keymap: {
      registerLayer: () => {
        layerRegistrations += 1;
        return () => {
          layerDisposals += 1;
        };
      },
    },
    lifecycle: {
      onDispose: (callback: () => void) => {
        disposeLifecycle = callback;
        return () => undefined;
      },
    },
    ui: {dialog: {}},
  } as never;

  await localPlugin.tui(api, undefined, {} as never);
  await localPlugin.tui(api, undefined, {} as never);
  disposeLifecycle?.();
  disposeLifecycle?.();

  expect(commandRegistrations).toBe(0);
  expect(layerRegistrations).toBe(1);
  expect(commandDisposals).toBe(0);
  expect(layerDisposals).toBe(1);
});

test("/codex-limits loads shared core data directly without an LLM prompt", async () => {
  let command: {run?: () => Promise<void>} | undefined;
  const messages: string[] = [];
  let globalDialogClears = 0;
  const localPlugin = createOpencodePlugin({
    getLimits: async () => createFakeLimitsResult(),
    nextFrame: async () => undefined,
  });
  const api = {
    keymap: {
      registerLayer: (layer: {commands: Array<typeof command>}) => {
        command = layer.commands[0];
        return () => undefined;
      },
    },
    lifecycle: {onDispose: () => () => undefined},
    ui: {
      DialogAlert: ({message}: {message: string}) => ({message}),
      dialog: {
        clear: () => {
          globalDialogClears += 1;
        },
        setSize: () => undefined,
        replace: (render: () => {message: string}) => messages.push(render().message),
      },
      toast: () => undefined,
    },
  } as never;

  await localPlugin.tui(api, undefined, {} as never);
  await command?.run?.();

  expect(globalDialogClears).toBe(1);
  expect(messages[0]).toBe("Loading Codex limits...");
  expect(messages[1]).toContain("93% remaining");
  expect(messages[1]).toContain("Reset credits");
});

test("/codex-limits presents a safe static error", async () => {
  let command: {onSelect?: () => Promise<void>} | undefined;
  const messages: string[] = [];
  const toasts: Array<{variant: string; title: string; message: string}> = [];
  const localPlugin = createOpencodePlugin({
    getLimits: async () => {
      throw new Error("Bearer fake-secret-token at C:/private/auth.json");
    },
    nextFrame: async () => undefined,
  });
  const api = {
    command: {
      register: (callback: () => Array<typeof command>) => {
        command = callback()[0];
        return () => undefined;
      },
    },
    lifecycle: {onDispose: () => () => undefined},
    ui: {
      DialogAlert: ({message}: {message: string}) => ({message}),
      dialog: {
        clear: () => undefined,
        setSize: () => undefined,
        replace: (render: () => {message: string}) => messages.push(render().message),
      },
      toast: (toast: {variant: string; title: string; message: string}) => toasts.push(toast),
    },
  } as never;

  await localPlugin.tui(api, undefined, {} as never);
  await command?.onSelect?.();

  expect(messages.at(-1)).toBe("Could not load Codex limits.");
  expect(toasts).toEqual([
    {variant: "error", title: "Codex Limits", message: "Could not load Codex limits."},
  ]);
  expect(JSON.stringify({messages, toasts})).not.toContain("fake-secret-token");
  expect(JSON.stringify({messages, toasts})).not.toContain("private");
});
