import {homedir} from "node:os";
import {isAbsolute} from "node:path";
import {AgentInstallError, type AgentInstallResult, type AgentIntegration} from "@/agents";
import type {CliIo, Prompt} from "@/package/commands/runtime";
import {sanitizeArguments, sanitizePublicErrorMessage} from "@/package/commands/safe-error";
import {isPathWithin, toSafeRelativePath} from "@/package/core/utils/safe-path";

const MAX_DISPLAY_PATHS = 4;

export type AgentInstallSelection = {kind: "prompt"} | {kind: "selected"; ids: readonly string[]};

export interface AgentInstallGuidance {
  invocation: string;
  explicitExample: string;
}

/** Resolves explicit, all-agent, and interactive installation modes consistently. */
export function getAgentInstallSelection(
  installAll: boolean,
  selectedIds: readonly string[],
  allIds: readonly string[]
): AgentInstallSelection {
  if (installAll) {
    return {kind: "selected", ids: allIds};
  }
  if (selectedIds.length > 0) {
    return {kind: "selected", ids: selectedIds};
  }
  return {kind: "prompt"};
}

interface AgentInstallDependencies {
  io: CliIo;
  integrations: readonly AgentIntegration[];
}

/** Installs selected integrations or prompts without owning any CLI parsing or help text. */
export async function installAgentIntegrations(
  selection: AgentInstallSelection,
  guidance: AgentInstallGuidance,
  dependencies: AgentInstallDependencies
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
    ids = await promptForIntegrations(prompt, dependencies.integrations);
  } catch {
    dependencies.io.stderr(`${guidance.invocation}: Interactive setup failed.\n`);
    return 1;
  } finally {
    await closePrompt(prompt);
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
  dependencies: AgentInstallDependencies
): Promise<number> {
  let failed = false;

  for (const id of ids) {
    const integration = dependencies.integrations.find((candidate) => candidate.id === id);
    if (!integration) {
      dependencies.io.stderr(`Unknown integration: ${sanitizeArguments([id])}\n`);
      failed = true;
      continue;
    }

    let result: AgentInstallResult;
    // Catch only adapter work so output failures are reported by the command router instead.
    try {
      result = await integration.install();
    } catch (error) {
      dependencies.io.stderr(`${integration.id}: ${formatInstallError(error)}\n`);
      failed = true;
      continue;
    }

    const state = result.changed ? "installed" : "already installed";
    dependencies.io.stdout(`${integration.id}: ${state}${formatConfigPaths(result)}\n`);
  }

  if (!failed) {
    dependencies.io.stdout("Restart the target agent terminal for changes to take effect.\n");
  }
  return failed ? 1 : 0;
}

async function promptForIntegrations(
  prompt: Prompt,
  integrations: readonly AgentIntegration[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const integration of integrations) {
    const answer = await prompt(
      `Install ${integration.displayName}? ${integration.description} [Y/n] `
    );
    if (isYes(answer)) {
      ids.push(integration.id);
    }
  }
  return ids;
}

async function closePrompt(prompt: Prompt): Promise<void> {
  try {
    await prompt.close?.();
  } catch {
    // Closing a completed prompt must not turn a successful installation into a failure.
  }
}

function formatConfigPaths(result: AgentInstallResult): string {
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

function isYes(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return normalized === "" || normalized === "y" || normalized === "yes";
}
