import { expect, test } from "bun:test";
import plugin from "../../../src/agents/opencode/plugin";

test("opencode plugin registers the slash command through legacy command api", async () => {
  const commands: Array<{ slash?: { name: string }; value: string }> = [];
  let disposed = false;

  await plugin.tui({
    command: {
      register: (callback: () => Array<{ slash?: { name: string }; value: string }>) => {
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
  } as never, undefined, {} as never);

  expect(commands).toHaveLength(1);
  expect(commands[0]?.value).toBe("codex-limits.show");
  expect(commands[0]?.slash?.name).toBe("codex-limits");
  expect(disposed).toBe(true);
});

test("opencode plugin also registers the slash command through keymap", async () => {
  const commands: Array<{ slash?: { name: string }; value: string }> = [];
  const layers: Array<{ commands: Array<{ slash?: { name: string }; value: string }>; bindings: never[] }> = [];
  let disposeCount = 0;

  await plugin.tui({
    command: {
      register: (callback: () => Array<{ slash?: { name: string }; value: string }>) => {
        commands.push(...callback());
        return () => {
          disposeCount += 1;
        };
      },
    },
    keymap: {
      registerLayer: (layer: { commands: Array<{ slash?: { name: string }; value: string }>; bindings: never[] }) => {
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
  } as never, undefined, {} as never);

  expect(commands).toHaveLength(1);
  expect(commands[0]?.value).toBe("codex-limits.show");
  expect(commands[0]?.slash?.name).toBe("codex-limits");
  expect(layers).toHaveLength(1);
  expect(layers[0]?.commands[0]?.value).toBe("codex-limits.show");
  expect(layers[0]?.commands[0]?.slash?.name).toBe("codex-limits");
  expect(disposeCount).toBe(2);
});
