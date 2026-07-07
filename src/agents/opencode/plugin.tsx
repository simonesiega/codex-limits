import type { TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { getCodexLimits } from "../../package/core/limits";
import { formatOpencodeLimits } from "./format";

const TITLE = "Codex Limits";
const DESCRIPTION = "Check Codex limits, resets, and credits.";

const module: TuiPluginModule = {
  id: "codex-limits",
  tui: async (api) => {
    api.command?.register(() => [
      {
        title: TITLE,
        value: "codex-limits.show",
        description: DESCRIPTION,
        category: "Codex",
        slash: { name: "codex-limits" },
        onSelect: async (dialog) => {
          dialog?.clear();
          api.ui.dialog.clear();
          await nextFrame();

          const target = api.ui.dialog;
          target.setSize("large");
          target.replace(() => alert(api, "Loading Codex limits..."));

          try {
            const result = await getCodexLimits();
            target.replace(() => alert(api, formatOpencodeLimits(result)));
          } catch (error) {
            const message = error instanceof Error ? error.message : "Could not load Codex limits.";
            api.ui.toast({ variant: "error", title: TITLE, message });
            target.replace(() => alert(api, message));
          }
        },
      },
    ]);
  },
};

function alert(api: TuiPluginApi, message: string) {
  return api.ui.DialogAlert({ title: TITLE, message });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export default module;
export const tui = module.tui;
