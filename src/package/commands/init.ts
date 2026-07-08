import {createInterface, type Interface} from "node:readline/promises";
import {stdin as processStdin, stdout as processStdout} from "node:process";
import {AGENT_INTEGRATIONS, type AgentIntegration} from "../../agents";

type WriteOutput = (text: string) => void;

export interface RunInitOptions {
  /** Output writer for stdout, defaults to process.stdout. */
  stdout?: WriteOutput;
  /** Output writer for stderr, defaults to process.stderr. */
  stderr?: WriteOutput;
  /** Test seam for answers. */
  prompt?: (question: string) => Promise<string>;
  /** Whether stdin can be used interactively. */
  interactive?: boolean;
  /** Test seam for exercising multiple integrations. */
  integrations?: AgentIntegration[];
}

function getInitHelp(integrations: AgentIntegration[]): string {
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

/**
 * Runs the interactive integration installer.
 *
 * @param args - Init command arguments.
 * @param options - Optional IO overrides.
 * @returns Process exit code.
 */
export async function runInit(args: string[], options: RunInitOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((text) => process.stdout.write(text));
  const stderr = options.stderr ?? ((text) => process.stderr.write(text));
  const interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const integrations = options.integrations ?? AGENT_INTEGRATIONS;
  const initHelp = getInitHelp(integrations);

  if (args.includes("--help") || args.includes("-h")) {
    stdout(initHelp);
    return 0;
  }

  const validOptions = new Set([
    "--all",
    ...integrations.map((integration) => `--${integration.id}`),
  ]);
  const unknown = args.find((arg) => arg.startsWith("-") && !validOptions.has(arg));
  if (unknown) {
    stderr(`Unknown init option: ${unknown}\n\n${initHelp}`);
    return 1;
  }

  const selected = parseSelectedIntegrations(args, integrations);
  if (selected.length > 0) {
    return installSelected(selected, integrations, stdout, stderr);
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
    const answers: string[] = [];
    for (const integration of integrations) {
      const answer = await prompt(`Install ${integration.name}? ${integration.description} [Y/n] `);
      if (isYes(answer)) {
        answers.push(integration.id);
      }
    }

    if (answers.length === 0) {
      stdout("No integrations installed. You can run `codex-limits init` again later.\n");
      return 0;
    }

    return installSelected(answers, integrations, stdout, stderr);
  } finally {
    closePrompt(prompt);
  }
}

/**
 * Parses the selected integrations from the command line arguments.
 * @param args - The command line arguments.
 * @returns The list of selected integration IDs.
 */
function parseSelectedIntegrations(args: string[], integrations: AgentIntegration[]): string[] {
  if (args.includes("--all")) {
    return integrations.map((integration) => integration.id);
  }

  return integrations
    .filter((integration) => args.includes(`--${integration.id}`))
    .map((integration) => integration.id);
}

/**
 * Installs the selected integrations.
 * @param ids - The list of integration IDs to install.
 * @param integrations - Available integrations.
 * @param stdout - The output writer for stdout.
 * @param stderr - The output writer for stderr.
 * @returns A promise resolving to the exit code.
 */
async function installSelected(
  ids: string[],
  integrations: AgentIntegration[],
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
      const message = error instanceof Error ? error.message : "Unknown error.";
      stderr(`${integration.name}: ${message}\n`);
      failed = true;
    }
  }

  if (!failed) {
    stdout("Restart the target agent terminal for changes to take effect.\n");
  }

  return failed ? 1 : 0;
}

/**
 * Creates a prompt for user interaction.
 * @returns The prompt function and a close method.
 */
function createPrompt(): ((question: string) => Promise<string>) & {close: () => void} {
  const reader = createInterface({input: processStdin, output: processStdout});
  const prompt = ((question: string) => reader.question(question)) as ((
    question: string
  ) => Promise<string>) & {close: () => void};
  prompt.close = () => reader.close();
  return prompt;
}

/**
 * Closes the given prompt.
 * @param prompt - The prompt to close.
 */
function closePrompt(prompt: (question: string) => Promise<string>): void {
  const maybeClose = prompt as Partial<Pick<Interface, "close">>;
  maybeClose.close?.();
}

/**
 * Checks if the given answer is a yes response.
 * @param answer - The answer to check.
 * @returns True if the answer is yes, false otherwise.
 */
function isYes(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return normalized === "" || normalized === "y" || normalized === "yes";
}
