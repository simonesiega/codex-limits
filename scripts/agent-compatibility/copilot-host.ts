/**
 * @fileoverview Real-host compatibility support for copilot host. This module keeps external process behavior bounded and reports sanitized diagnostics to the compatibility harness.
 */
import {type CompatibilityHarness, executablePath} from "./harness";
import {probeInteractiveHost} from "./interactive-host";

interface CopilotHostProbeOptions {
  harness: CompatibilityHarness;
  hostRoot: string;
  workspace: string;
  environment: NodeJS.ProcessEnv;
}

/** Exercises the packed extension through a real GitHub Copilot CLI host. */
export function probeCopilot({
  harness,
  hostRoot,
  workspace,
  environment,
}: CopilotHostProbeOptions): Promise<void> {
  return probeInteractiveHost({
    harness,
    command: executablePath(hostRoot, "copilot"),
    args: [
      "--experimental",
      "--disable-builtin-mcps",
      "--no-auto-update",
      "--no-remote",
      "--no-remote-export",
      "--no-custom-instructions",
      "--no-color",
      "--no-mouse",
      "--log-level",
      "error",
      "-C",
      workspace,
    ],
    cwd: workspace,
    environment,
    readiness: /commands|Please use \/login/i,
    expectedOutput: /Live usage requires Codex authentication/i,
    startupConfirmation: /Do you trust the files in this folder\?/i,
    useTmux: true,
  });
}
