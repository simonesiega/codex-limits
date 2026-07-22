import {detectCodexHome} from "@/package/core/codex/paths";
import {getLocalUsage} from "@/package/core/limits";
import type {CodexDiagnosticsResult, CodexLimitsOptions} from "@/package/core/types";
import {inspectLiveUsage} from "@/package/core/usage/live";

/** Runs bounded, read-only Codex environment checks without returning paths or credentials. */
export async function getCodexDiagnostics(
  options: CodexLimitsOptions = {}
): Promise<CodexDiagnosticsResult> {
  const [home, localUsage, liveUsage] = await Promise.all([
    detectCodexHome(options),
    getLocalUsage(options),
    inspectLiveUsage(options),
  ]);

  return {
    codexHomeDetected: home.foundHome !== null,
    authenticationFound: liveUsage.authenticationFound,
    localUsageFound: localUsage.status !== "unavailable",
    liveEndpoint: liveUsage.endpointStatus,
  };
}
