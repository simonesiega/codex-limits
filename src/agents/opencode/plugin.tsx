import type {TuiCommand, TuiPluginApi, TuiPluginModule} from "@opencode-ai/plugin/tui";
import {formatOpencodeLimits} from "@/agents/opencode/format";
import {getCodexLimits} from "@/package/core/limits";
import type {CodexLimitsResult} from "@/package/core/types";

const TITLE = "Codex Limits";
const DESCRIPTION = "Check Codex limits, resets, and credits.";
const SAFE_LOAD_ERROR = "Could not load Codex limits.";

interface OpencodePluginDependencies {
  getLimits?: () => Promise<CodexLimitsResult>;
  nextFrame?: () => Promise<void>;
}

/** Creates the OpenCode TUI plugin with optional test dependencies. */
export function createOpencodePlugin(
  dependencies: OpencodePluginDependencies = {}
): TuiPluginModule {
  const activeApis = new WeakSet<TuiPluginApi>();
  const loadLimits = dependencies.getLimits ?? getCodexLimits;
  const waitForNextFrame =
    dependencies.nextFrame ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  return {
    id: "codex-limits",
    tui: async (api) => {
      if (activeApis.has(api)) {
        return;
      }

      const command = createCommand(api, loadLimits, waitForNextFrame);
      let unregister: (() => void) | undefined;

      try {
        const registration = registerCommand(api, command);
        unregister = typeof registration === "function" ? registration : undefined;
      } catch {
        throw new Error("Could not register the codex-limits OpenCode command.");
      }

      const dispose = (): void => {
        if (!activeApis.delete(api)) {
          return;
        }
        try {
          unregister?.();
        } catch {
          // OpenCode shutdown should continue when a third-party disposer fails.
        }
      };

      activeApis.add(api);
      try {
        api.lifecycle.onDispose(dispose);
      } catch {
        dispose();
        throw new Error("Could not register the codex-limits OpenCode lifecycle.");
      }
    },
  };
}

function createCommand(
  api: TuiPluginApi,
  loadLimits: () => Promise<CodexLimitsResult>,
  waitForNextFrame: () => Promise<void>
): TuiCommand {
  let invocation = 0;

  return {
    title: TITLE,
    value: "codex-limits.show",
    description: DESCRIPTION,
    category: "Codex",
    slash: {name: "codex-limits"},
    onSelect: async (dialog) => {
      // The shared dialog must only show the newest request when earlier requests finish later.
      const currentInvocation = ++invocation;
      dialog?.clear();
      api.ui.dialog.clear();
      await waitForNextFrame();

      const target = api.ui.dialog;
      const show = (message: string): void =>
        target.replace(() => api.ui.DialogAlert({title: TITLE, message}));
      target.setSize("large");
      show("Loading Codex limits...");

      try {
        const result = await loadLimits();
        if (currentInvocation === invocation) {
          show(formatOpencodeLimits(result));
        }
      } catch {
        if (currentInvocation === invocation) {
          api.ui.toast({variant: "error", title: TITLE, message: SAFE_LOAD_ERROR});
          show(SAFE_LOAD_ERROR);
        }
      }
    },
  };
}

function registerCommand(api: TuiPluginApi, command: TuiCommand): void | (() => void) {
  const compatibleApi = api as {
    command?: TuiPluginApi["command"];
    keymap?: TuiPluginApi["keymap"];
  };

  // Current OpenCode implements `api.command` through keymap; registering both creates duplicates.
  if (typeof compatibleApi.keymap?.registerLayer === "function") {
    return compatibleApi.keymap.registerLayer({
      commands: [
        {
          namespace: "palette",
          name: command.value,
          title: command.title,
          desc: command.description,
          category: command.category,
          slashName: command.slash?.name,
          slashAliases: command.slash?.aliases,
          run: () => command.onSelect?.(),
        },
      ],
      bindings: [],
    });
  }

  if (typeof compatibleApi.command?.register === "function") {
    return compatibleApi.command.register(() => [command]);
  }

  throw new Error("No supported OpenCode command API is available.");
}

const plugin = createOpencodePlugin();

export default plugin;
export const tui = plugin.tui;
