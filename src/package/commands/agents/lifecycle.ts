import type {AgentIntegration, AgentLifecycleResult} from "@/agents";
import type {CliIo, Prompt} from "@/package/commands/runtime";
import {sanitizeArguments} from "@/package/commands/safe-error";

export type AgentLifecycleSelection = {kind: "prompt"} | {kind: "selected"; ids: readonly string[]};

export interface AgentLifecycleGuidance {
  invocation: string;
  explicitExample: string;
}

export interface AgentLifecycleDependencies {
  io: CliIo;
  integrations: readonly AgentIntegration[];
}

interface RunSelectedAgentIntegrationsOptions {
  run: (integration: AgentIntegration) => Promise<AgentLifecycleResult>;
  formatError: (error: unknown) => string;
  formatResult: (result: AgentLifecycleResult) => string;
}

export interface AgentLifecycleSummary {
  changed: boolean;
  failed: boolean;
}

/** Resolves explicit, all-agent, and interactive lifecycle targets consistently. */
export function getAgentLifecycleSelection(
  selectAll: boolean,
  selectedIds: readonly string[],
  allIds: readonly string[]
): AgentLifecycleSelection {
  if (selectAll) {
    return {kind: "selected", ids: allIds};
  }
  if (selectedIds.length > 0) {
    return {kind: "selected", ids: selectedIds};
  }
  return {kind: "prompt"};
}

/** Runs one lifecycle operation per selected adapter while isolating adapter failures. */
export async function runSelectedAgentIntegrations(
  ids: readonly string[],
  dependencies: AgentLifecycleDependencies,
  options: RunSelectedAgentIntegrationsOptions
): Promise<AgentLifecycleSummary> {
  let changed = false;
  let failed = false;
  const integrationsById = new Map(
    dependencies.integrations.map((integration) => [integration.id, integration])
  );

  for (const id of ids) {
    const integration = integrationsById.get(id);
    if (!integration) {
      dependencies.io.stderr(`Unknown integration: ${sanitizeArguments([id])}\n`);
      failed = true;
      continue;
    }

    let result: AgentLifecycleResult;
    // Catch only adapter work so output failures are reported by the command router instead.
    try {
      result = await options.run(integration);
    } catch (error) {
      dependencies.io.stderr(`${integration.id}: ${options.formatError(error)}\n`);
      failed = true;
      continue;
    }

    changed ||= result.changed;
    dependencies.io.stdout(`${integration.id}: ${options.formatResult(result)}\n`);
  }

  return {changed, failed};
}

/** Prompts once per candidate and returns only positively selected adapter IDs. */
export async function promptForAgentIntegrations(
  prompt: Prompt,
  integrations: readonly AgentIntegration[],
  question: (integration: AgentIntegration) => string,
  isSelected: (answer: string) => boolean
): Promise<string[]> {
  const ids: string[] = [];
  for (const integration of integrations) {
    if (isSelected(await prompt(question(integration)))) {
      ids.push(integration.id);
    }
  }
  return ids;
}

/** Closes a completed lifecycle prompt without replacing the operation result. */
export async function closeAgentPrompt(prompt: Prompt): Promise<void> {
  try {
    await prompt.close?.();
  } catch {
    // A prompt cleanup failure must not replace the lifecycle operation result.
  }
}

/** Accepts an explicit yes and optionally treats an empty answer as yes. */
export function isAffirmativeAnswer(answer: string, acceptEmpty: boolean): boolean {
  const normalized = answer.trim().toLowerCase();
  return (acceptEmpty && normalized === "") || normalized === "y" || normalized === "yes";
}
