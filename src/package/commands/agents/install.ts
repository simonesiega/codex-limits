import {homedir} from "node:os";
import {isAbsolute} from "node:path";
import {AgentInstallError, type AgentLifecycleResult} from "@/agents";
import {
  closeAgentPrompt,
  isAffirmativeAnswer,
  promptForAgentIntegrations,
  runSelectedAgentIntegrations,
  type AgentLifecycleDependencies,
  type AgentLifecycleGuidance,
  type AgentLifecycleSelection,
} from "@/package/commands/agents/lifecycle";
import type {Prompt} from "@/package/commands/runtime";
import {sanitizePublicErrorMessage} from "@/package/commands/safe-error";
import {isPathWithin, toSafeRelativePath} from "@/package/core/utils/safe-path";

const MAX_DISPLAY_PATHS = 4;

/** Installs selected integrations or prompts without owning any CLI parsing or help text. */
export async function installAgentIntegrations(
  selection: AgentLifecycleSelection,
  guidance: AgentLifecycleGuidance,
  dependencies: AgentLifecycleDependencies
): Promise<number> {
  if (dependencies.integrations.length === 0) {
    dependencies.io.stdout("No supported agent integrations are available.\n");
    return 0;
  }
  if (selection.kind === "selected") {
    return installSelected(selection.ids, dependencies);
  }

  if (!dependencies.io.interactive) {
    dependencies.io.stdout(
      `${guidance.invocation} requires an interactive terminal. Run \`${guidance.invocation} --all\` or \`${guidance.explicitExample}\` to install integrations.\n`
    );
    return 0;
  }

  dependencies.io.stdout("codex-limits setup\n\n");
  dependencies.io.stdout("Choose which agent integrations to install.\n\n");

  let prompt: Prompt;
  try {
    prompt = dependencies.io.createPrompt();
  } catch {
    dependencies.io.stderr(`${guidance.invocation}: Interactive setup failed.\n`);
    return 1;
  }

  let ids: string[];
  try {
    ids = await promptForAgentIntegrations(
      prompt,
      dependencies.integrations,
      (integration) => `Install ${integration.displayName}? ${integration.description} [Y/n] `,
      (answer) => isAffirmativeAnswer(answer, true)
    );
  } catch {
    dependencies.io.stderr(`${guidance.invocation}: Interactive setup failed.\n`);
    return 1;
  } finally {
    await closeAgentPrompt(prompt);
  }

  if (ids.length === 0) {
    dependencies.io.stdout(
      `No integrations installed. You can run \`${guidance.invocation}\` again later.\n`
    );
    return 0;
  }

  return installSelected(ids, dependencies);
}

async function installSelected(
  ids: readonly string[],
  dependencies: AgentLifecycleDependencies
): Promise<number> {
  const summary = await runSelectedAgentIntegrations(ids, dependencies, {
    run: (integration) => integration.install(),
    formatError: formatInstallError,
    formatResult: (result) =>
      `${result.changed ? "installed" : "already installed"}${formatConfigPaths(result)}`,
  });

  if (!summary.failed) {
    dependencies.io.stdout("Restart the target agent terminal for changes to take effect.\n");
  }
  return summary.failed ? 1 : 0;
}

function formatConfigPaths(result: AgentLifecycleResult): string {
  const paths = result.configPaths;
  if (!paths?.length) {
    return "";
  }
  const displayed = paths.slice(0, MAX_DISPLAY_PATHS).map(formatConfigPath);
  if (paths.length > MAX_DISPLAY_PATHS) {
    displayed.push(`+${paths.length - MAX_DISPLAY_PATHS} more`);
  }
  return ` (${displayed.join(", ")})`;
}

function formatConfigPath(path: string): string {
  const home = homedir();
  // Never expose an adapter-provided absolute path outside the current user's home.
  if (path.length > 1_024 || !isAbsolute(path) || !isPathWithin(home, path)) {
    return "[path]";
  }
  const relativePath = toSafeRelativePath(home, path).replaceAll("\\", "/");
  return relativePath === "." ? "~" : `~/${relativePath}`;
}

function formatInstallError(error: unknown): string {
  if (!(error instanceof AgentInstallError)) {
    return "Integration installation failed.";
  }
  return sanitizePublicErrorMessage(error.message, "Integration installation failed.");
}
