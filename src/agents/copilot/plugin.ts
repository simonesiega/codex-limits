import {
  joinSession as joinCopilotSession,
  type JoinSessionConfig,
} from "@github/copilot-sdk/extension";
import {formatCopilotLimits} from "@/agents/copilot/format";
import {getCodexLimits} from "@/package/core/limits";
import type {CodexLimitsResult} from "@/package/core/types";

const SAFE_LOAD_ERROR = "Could not load Codex limits.";
const SAFE_DISPLAY_ERROR = "Could not display Codex limits.";

/** Stable marker used to identify extension files managed by the installer. */
export const COPILOT_EXTENSION_MARKER = "codex-limits-copilot-extension-v1";

interface CopilotTimeline {
  log: (
    message: string,
    options?: {level?: "info" | "warning" | "error"; ephemeral?: boolean}
  ) => Promise<void>;
}

interface CopilotJoinOptions {
  commands: NonNullable<JoinSessionConfig["commands"]>;
}

interface CopilotExtensionDependencies {
  getLimits?: () => Promise<CodexLimitsResult>;
  joinSession?: (options: CopilotJoinOptions) => Promise<CopilotTimeline>;
}

/** Starts the Copilot CLI extension and registers its read-only slash command. */
export async function startCopilotExtension(
  dependencies: CopilotExtensionDependencies = {}
): Promise<void> {
  const loadLimits = dependencies.getLimits ?? getCodexLimits;
  const joinSession =
    dependencies.joinSession ??
    ((options: CopilotJoinOptions): Promise<CopilotTimeline> => joinCopilotSession(options));
  let session: CopilotTimeline | undefined;

  session = await joinSession({
    commands: [
      {
        name: "codex-limits",
        description: "Check Codex limits, resets, and credits",
        handler: async () => {
          let message: string;
          try {
            message = formatCopilotLimits(await loadLimits());
          } catch {
            await logToTimeline(session, SAFE_LOAD_ERROR, {level: "error"});
            return;
          }

          await logToTimeline(session, message);
        },
      },
    ],
  });
}

async function logToTimeline(
  session: CopilotTimeline | undefined,
  message: string,
  options?: {level?: "info" | "warning" | "error"; ephemeral?: boolean}
): Promise<void> {
  if (!session) {
    throw new Error(SAFE_DISPLAY_ERROR);
  }
  try {
    await session.log(message, options);
  } catch {
    throw new Error(SAFE_DISPLAY_ERROR);
  }
}

// The dedicated production build enables startup while source imports remain side-effect free.
declare const __CODEX_LIMITS_COPILOT_EXTENSION__: boolean;

if (
  typeof __CODEX_LIMITS_COPILOT_EXTENSION__ !== "undefined" &&
  __CODEX_LIMITS_COPILOT_EXTENSION__
) {
  try {
    await startCopilotExtension();
  } catch {
    process.exitCode = 1;
  }
}

export default startCopilotExtension;
