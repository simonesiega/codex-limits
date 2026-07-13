import {stdin as processStdin, stdout as processStdout} from "node:process";
import {createInterface} from "node:readline/promises";
import {AGENT_INTEGRATIONS, AgentInstallError, type AgentIntegration} from "@/agents";
import {sanitizeArguments} from "@/package/commands/safe-error";

type WriteOutput = (text: string) => void;
type Prompt = ((question: string) => Promise<string>) & {close?: () => void};

export interface RunInitOptions {
  stdout?: WriteOutput;
  stderr?: WriteOutput;
  prompt?: Prompt;
  interactive?: boolean;
  integrations?: AgentIntegration[];
}

type ParsedInitArgs =
  | {kind: "help"}
  | {kind: "install"; ids: string[]}
  | {kind: "invalid"; error: string}
  | {kind: "prompt"};

/** Runs interactive or explicitly selected agent integration setup. */
export async function runInit(args: string[], options: RunInitOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((text) => processStdout.write(text));
  const stderr = options.stderr ?? ((text) => process.stderr.write(text));
  const interactive = options.interactive ?? Boolean(processStdin.isTTY && processStdout.isTTY);
  const integrations = options.integrations ?? AGENT_INTEGRATIONS;
  const initHelp = getInitHelp(integrations);
  const parsed = parseInitArgs(args, integrations);

  if (parsed.kind === "help") {
    stdout(initHelp);
    return 0;
  }
  if (parsed.kind === "invalid") {
    stderr(`${parsed.error}\n\n${initHelp}`);
    return 1;
  }
  if (parsed.kind === "install") {
    return installSelected(parsed.ids, integrations, stdout, stderr);
  }

  if (!interactive && !options.prompt) {
    const firstFlag = integrations[0] ? `--${integrations[0].id}` : "--all";
    stdout(
      `codex-limits init requires an interactive terminal. Run \`codex-limits init --all\` or \`codex-limits init ${firstFlag}\` to install integrations.\n`
    );
    return 0;
  }

  stdout("codex-limits setup\n\n");
  stdout("Choose which agent integrations to install.\n\n");
  const prompt = options.prompt ?? createPrompt();

  try {
    const ids: string[] = [];
    for (const integration of integrations) {
      const answer = await prompt(`Install ${integration.name}? ${integration.description} [Y/n] `);
      if (isYes(answer)) {
        ids.push(integration.id);
      }
    }

    if (ids.length === 0) {
      stdout("No integrations installed. You can run `codex-limits init` again later.\n");
      return 0;
    }

    return installSelected(ids, integrations, stdout, stderr);
  } catch {
    stderr("codex-limits init: Interactive setup failed.\n");
    return 1;
  } finally {
    prompt.close?.();
  }
}

function getInitHelp(integrations: readonly AgentIntegration[]): string {
  const integrationUsage = integrations
    .map(
      (integration) =>
        `  codex-limits init --${integration.id.padEnd(8)} Install the ${integration.name} integration`
    )
    .join("\n");

  return `codex-limits init

  Install optional agent integrations.

  Usage:
    codex-limits init             Prompt for integrations
  ${integrationUsage}
    codex-limits init --all       Install all integrations
    codex-limits init --help      Print this help text
  `;
}

function parseInitArgs(
  args: readonly string[],
  integrations: readonly AgentIntegration[]
): ParsedInitArgs {
  if (args.length === 0) {
    return {kind: "prompt"};
  }
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    return {kind: "help"};
  }

  const integrationFlags = new Map(
    integrations.map((integration) => [`--${integration.id}`, integration.id])
  );
  const seen = new Set<string>();

  for (const arg of args) {
    if (!arg.startsWith("-")) {
      return {kind: "invalid", error: `Unexpected init argument: ${sanitizeArguments([arg])}`};
    }
    if (arg !== "--all" && !integrationFlags.has(arg)) {
      return {kind: "invalid", error: `Unknown init option: ${sanitizeArguments([arg])}`};
    }
    if (seen.has(arg)) {
      return {kind: "invalid", error: `Duplicate init option: ${arg}`};
    }
    seen.add(arg);
  }

  if (seen.has("--all") && seen.size > 1) {
    return {
      kind: "invalid",
      error: "Init option --all cannot be combined with integration options.",
    };
  }

  return {
    kind: "install",
    ids: seen.has("--all")
      ? integrations.map((integration) => integration.id)
      : args.flatMap((arg) => {
          const id = integrationFlags.get(arg);
          return id ? [id] : [];
        }),
  };
}

async function installSelected(
  ids: readonly string[],
  integrations: readonly AgentIntegration[],
  stdout: WriteOutput,
  stderr: WriteOutput
): Promise<number> {
  let failed = false;

  for (const id of ids) {
    const integration = integrations.find((candidate) => candidate.id === id);
    if (!integration) {
      stderr(`Unknown integration: ${id}\n`);
      failed = true;
      continue;
    }

    try {
      const result = await integration.install();
      const state = result.changed ? "installed" : "already installed";
      const paths = result.configPaths?.length ? ` (${result.configPaths.join(", ")})` : "";
      stdout(`${integration.name}: ${state}${paths}\n`);
    } catch (error) {
      const message =
        error instanceof AgentInstallError ? error.message : "Integration installation failed.";
      stderr(`${integration.name}: ${message}\n`);
      failed = true;
    }
  }

  if (!failed) {
    stdout("Restart the target agent terminal for changes to take effect.\n");
  }
  return failed ? 1 : 0;
}

function createPrompt(): Prompt {
  const reader = createInterface({input: processStdin, output: processStdout});
  const prompt: Prompt = (question) => reader.question(question);
  prompt.close = () => reader.close();
  return prompt;
}

function isYes(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return normalized === "" || normalized === "y" || normalized === "yes";
}
