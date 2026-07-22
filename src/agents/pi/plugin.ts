import type {ExtensionAPI, ExtensionCommandContext, Theme} from "@earendil-works/pi-coding-agent";
import {DynamicBorder} from "@earendil-works/pi-coding-agent";
import {Container, matchesKey, Text} from "@earendil-works/pi-tui";
import {formatPiLimits} from "@/agents/pi/format";
import {getCodexLimits} from "@/package/core/limits";
import type {CodexLimitsResult} from "@/package/core/types";

const TITLE = "Codex Limits";
const SAFE_LOAD_ERROR = "Could not load Codex limits.";
const SAFE_DISPLAY_ERROR = "Could not display Codex limits.";

interface PiPluginDependencies {
  getLimits?: () => Promise<CodexLimitsResult>;
}

/** Creates the pi extension with optional test dependencies. */
export function createPiPlugin(
  dependencies: PiPluginDependencies = {}
): (pi: ExtensionAPI) => void {
  const loadLimits = dependencies.getLimits ?? getCodexLimits;

  return (pi) => {
    pi.registerCommand("codex-limits", {
      description: "Check Codex limits, resets, and credits",
      handler: async (_args, ctx) => {
        // Custom components are terminal-only; RPC, print, and JSON modes must stay side-effect free.
        if (!ctx.hasUI || ctx.mode !== "tui") {
          return;
        }

        ctx.ui.setStatus("codex-limits", "Loading Codex limits...");
        let message: string;
        try {
          message = formatPiLimits(await loadLimits());
        } catch {
          message = SAFE_LOAD_ERROR;
          ctx.ui.notify(SAFE_LOAD_ERROR, "error");
        } finally {
          ctx.ui.setStatus("codex-limits", undefined);
        }

        try {
          await showDialog(message, ctx);
        } catch {
          ctx.ui.notify(SAFE_DISPLAY_ERROR, "error");
        }
      },
    });
  };
}

async function showDialog(message: string, ctx: ExtensionCommandContext): Promise<void> {
  await ctx.ui.custom<void>(
    (_tui, theme, _keybindings, done) => {
      let container = buildDialog(message, theme);

      return {
        render: (width: number) => container.render(width),
        invalidate: () => {
          container = buildDialog(message, theme);
        },
        handleInput: (data: string) => {
          if (
            matchesKey(data, "enter") ||
            matchesKey(data, "escape") ||
            matchesKey(data, "ctrl+c")
          ) {
            done(undefined);
          }
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        width: 56,
        minWidth: 36,
        maxHeight: "90%",
        margin: 1,
      },
    }
  );
}

function buildDialog(message: string, theme: Theme): Container {
  const container = new Container();
  container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
  container.addChild(new Text(theme.fg("accent", theme.bold(TITLE)), 1, 0));
  container.addChild(new Text(message, 1, 1));
  container.addChild(new Text(theme.fg("dim", "Press Enter or Esc to close"), 1, 0));
  container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
  return container;
}

const plugin = createPiPlugin();

export default plugin;
