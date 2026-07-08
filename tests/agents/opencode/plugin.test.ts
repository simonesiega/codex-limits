import { expect, test } from "bun:test";
import plugin from "../../../src/agents/opencode/plugin";

test("opencode plugin registers the slash command through keymap", async () => {
  const layers: Array<{ commands: Array<{ slash?: { name: string }; value: string }>; bindings: never[] }> = [];
  let disposed = false;
  const dispose = () => {
    disposed = true;
  };

  await plugin.tui({
    keymap: {
      registerLayer: (layer: { commands: Array<{ slash?: { name: string }; value: string }>; bindings: never[] }) => {
        layers.push(layer);
        return dispose;
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

  expect(layers).toHaveLength(1);
  expect(layers[0]?.commands[0]?.value).toBe("codex-limits.show");
  expect(layers[0]?.commands[0]?.slash?.name).toBe("codex-limits");
  expect(disposed).toBe(true);
});
