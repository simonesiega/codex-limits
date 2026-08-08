import {AgentUninstallError, type AgentIntegration} from "@/agents";
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

/** Uninstalls selected integrations or prompts only for integrations known to be installed. */
export async function uninstallAgentIntegrations(
  selection: AgentLifecycleSelection,
  guidance: AgentLifecycleGuidance,
  dependencies: AgentLifecycleDependencies
): Promise<number> {
  if (dependencies.integrations.length === 0) {
    dependencies.io.stdout("No supported agent integrations are available.\n");
    return 0;
  }
  if (selection.kind === "selected") {
    return uninstallSelected(selection.ids, dependencies);
  }

  if (!dependencies.io.interactive) {
    dependencies.io.stdout(
      `${guidance.invocation} requires an interactive terminal. Run \`${guidance.invocation} --all\` or \`${guidance.explicitExample}\` to uninstall integrations.\n`
    );
    return 0;
  }

  const installed = await findInstalledIntegrations(dependencies.integrations);
  if (installed.length === 0) {
    dependencies.io.stdout("No agent integrations were safely recognized as installed.\n");
    return 0;
  }

  dependencies.io.stdout("codex-limits agent removal\n\n");
  dependencies.io.stdout("Select integrations to uninstall:\n\n");

  let prompt: Prompt;
  try {
    prompt = dependencies.io.createPrompt();
  } catch {
    dependencies.io.stderr(`${guidance.invocation}: Interactive removal failed.\n`);
    return 1;
  }

  let ids: string[];
  try {
    ids = await promptForAgentIntegrations(
      prompt,
      installed,
      (integration) => `Uninstall ${integration.displayName}? [y/N] `,
      (answer) => isAffirmativeAnswer(answer, false)
    );
  } catch {
    dependencies.io.stderr(`${guidance.invocation}: Interactive removal failed.\n`);
    return 1;
  } finally {
    await closeAgentPrompt(prompt);
  }

  if (ids.length === 0) {
    dependencies.io.stdout(
      `No integrations uninstalled. You can run \`${guidance.invocation}\` again later.\n`
    );
    return 0;
  }

  return uninstallSelected(ids, dependencies);
}

async function findInstalledIntegrations(
  integrations: readonly AgentIntegration[]
): Promise<AgentIntegration[]> {
  const statuses = await Promise.all(
    integrations.map(async (integration) => {
      try {
        return (await integration.inspect()) === "installed";
      } catch {
        return false;
      }
    })
  );
  return integrations.filter((_, index) => statuses[index]);
}

async function uninstallSelected(
  ids: readonly string[],
  dependencies: AgentLifecycleDependencies
): Promise<number> {
  const summary = await runSelectedAgentIntegrations(ids, dependencies, {
    run: (integration) => integration.uninstall(),
    formatError: formatUninstallError,
    formatResult: (result) => (result.changed ? "uninstalled" : "not installed"),
  });

  if (summary.changed) {
    dependencies.io.stdout("Restart the target agent terminal for changes to take effect.\n");
  }
  return summary.failed ? 1 : 0;
}

function formatUninstallError(error: unknown): string {
  if (!(error instanceof AgentUninstallError)) {
    return "Integration uninstallation failed.";
  }
  return sanitizePublicErrorMessage(error.message, "Integration uninstallation failed.");
}
