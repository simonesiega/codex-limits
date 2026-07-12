import type {TuiCommand, TuiPluginApi, TuiPluginModule} from "@opencode-ai/plugin/tui";
import {getCodexLimits} from "../../package/core/limits";
import type {CodexLimitsResult} from "../../package/core/types";
import {formatOpencodeLimits} from "./format";

// Text shown in the OpenCode UI for the Codex Limits plugin.
const TITLE = "Codex Limits";
const DESCRIPTION = "Check Codex limits, resets, and credits.";
const SAFE_LOAD_ERROR = "Could not load Codex limits.";

/**
 * Store the dependencies for the OpenCode plugin, allowing for deterministic testing by injecting mock implementations.
 * @property getLimits - Optional function to retrieve the Codex limits, allowing for mock implementations in tests.
 * @property nextFrame - Optional function to wait for the next frame, allowing for mock implementations in tests.
 */
interface OpencodePluginDependencies {
  getLimits?: () => Promise<CodexLimitsResult>;
  nextFrame?: () => Promise<void>;
}

/**
 * Creates the OpenCode plugin for the Codex Limits agent.
 * @param dependencies - Optional dependencies for the OpenCode plugin.
 * @returns - The OpenCode plugin module for the Codex Limits agent, including the plugin ID and TUI function.
 */
export function createOpencodePlugin(
  dependencies: OpencodePluginDependencies = {}
): TuiPluginModule {
  const registrations = new WeakMap<TuiPluginApi, () => void>();
  const loadLimits = dependencies.getLimits ?? getCodexLimits;
  const waitForNextFrame = dependencies.nextFrame ?? nextFrame;

  return {
    id: "codex-limits",
    tui: async (api) => {
      if (registrations.has(api)) {
        return;
      }

      // Create the command for the Codex Limits plugin and register it with the OpenCode TUI API.
      const command = createCommand(api, loadLimits, waitForNextFrame);

      const disposes: Array<() => void> = [];

      // Register the command with the OpenCode TUI API, handling both legacy and new registration methods for compatibility.
      try {
        const legacyDispose = api.command?.register(() => [command]);
        if (isDispose(legacyDispose)) {
          disposes.push(legacyDispose);
        }

        const keymapDispose = registerCommandLayer(api, command);
        if (isDispose(keymapDispose)) {
          disposes.push(keymapDispose);
        }
      } catch {
        disposeAll(disposes);
        throw new Error("Could not register the codex-limits OpenCode command.");
      }

      let disposed = false;
      const dispose = (): void => {
        if (disposed) {
          return;
        }
        disposed = true;
        registrations.delete(api);
        disposeAll(disposes);
      };
      registrations.set(api, dispose);
      try {
        api.lifecycle.onDispose(dispose);
      } catch {
        dispose();
        throw new Error("Could not register the codex-limits OpenCode lifecycle.");
      }
    },
  };
}

/**
 * Creates the TUI command for the Codex Limits plugin.
 * @param api - The OpenCode TUI plugin API, providing access to the OpenCode UI and lifecycle events.
 * @param loadLimits - Function to load the Codex limits, allowing for mock implementations in tests.
 * @param waitForNextFrame - Function to wait for the next frame, allowing for mock implementations in tests.
 * @returns - The TUI command for the Codex Limits plugin.
 */
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
      const currentInvocation = ++invocation;
      dialog?.clear();
      api.ui.dialog.clear();
      await waitForNextFrame();

      const target = api.ui.dialog;
      target.setSize("large");
      target.replace(() => alert(api, "Loading Codex limits..."));

      // Load the Codex limits and display them in the OpenCode UI.
      try {
        const result = await loadLimits();
        if (currentInvocation === invocation) {
          target.replace(() => alert(api, formatOpencodeLimits(result)));
        }
      } catch {
        if (currentInvocation === invocation) {
          api.ui.toast({variant: "error", title: TITLE, message: SAFE_LOAD_ERROR});
          target.replace(() => alert(api, SAFE_LOAD_ERROR));
        }
      }
    },
  };
}

/**
 * Registers the TUI command for the Codex Limits plugin with the OpenCode TUI API.
 * @param api - The OpenCode TUI plugin API, providing access to the OpenCode UI and lifecycle events.
 * @param command - The TUI command for the Codex Limits plugin.
 * @returns - A function to dispose of the registered command layer, or undefined if registration failed.
 */
function registerCommandLayer(api: TuiPluginApi, command: TuiCommand): void | (() => void) {
  const keymap = (
    api as {
      keymap?: {
        registerLayer?: (layer: {commands: TuiCommand[]; bindings: never[]}) => void | (() => void);
      };
    }
  ).keymap;
  return keymap?.registerLayer?.({commands: [command], bindings: []});
}

/**
 * Disposes of all provided disposal functions.
 * @param disposes - An array of functions to dispose of.
 */
function disposeAll(disposes: readonly (() => void)[]): void {
  for (const dispose of disposes) {
    try {
      dispose();
    } catch {
      // Disposal is best effort and idempotent; adapter shutdown must not crash OpenCode.
    }
  }
}

/**
 * Checks if the provided value is a function, indicating that it can be used as a disposal function.
 * @param value - The value to check.
 * @returns - True if the value is a function, false otherwise.
 */
function isDispose(value: void | (() => void)): value is () => void {
  return typeof value === "function";
}

/**
 * Displays an alert dialog in the OpenCode UI.
 * @param api - The OpenCode TUI plugin API, providing access to the OpenCode UI and lifecycle events.
 * @param message - The message to display in the alert dialog.
 * @returns - The result of the alert dialog operation.
 */
function alert(api: TuiPluginApi, message: string) {
  return api.ui.DialogAlert({title: TITLE, message});
}

/**
 * Waits for the next frame to be rendered.
 * @returns - A promise that resolves when the next frame is rendered.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Create the OpenCode plugin module for the Codex Limits agent.
const module = createOpencodePlugin();

// Export the OpenCode plugin module and its TUI function for use in the OpenCode environment.
export default module;
export const tui = module.tui;
