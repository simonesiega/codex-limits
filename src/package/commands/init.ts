import {createInterface, type Interface} from "node:readline/promises";
import {stdin as processStdin, stdout as processStdout} from "node:process";
import {AGENT_INTEGRATIONS, AgentInstallError, type AgentIntegration} from "../../agents";
import {sanitizeArguments} from "./safe-error";

type WriteOutput = (text: string) => void;

/**
 * Store the options for running the `codex-limits init` command.
 */
export interface RunInitOptions {
  // Output writer for stdout, defaults to process.stdout.
  stdout?: WriteOutput;

  // Output writer for stderr, defaults to process.stderr.
  stderr?: WriteOutput;

  // Test seam for the interactive prompt.
  prompt?: (question: string) => Promise<string>;

  // Whether stdin can be used interactively.
  interactive?: boolean;

  // Test seam for exercising multiple integrations.
  integrations?: AgentIntegration[];
}

/**
 * Store the parsed arguments for the `codex-limits init` command.
 */
interface ParsedInitArgs {
  kind: "help" | "install" | "invalid" | "prompt";
  ids: string[];
  error?: string;
}

/**
 * Install optional agent integrations for the `codex-limits init` command.
 * @param args - Command-line arguments for the init command.
 * @param options - Options for running the init command.
 * @returns - Exit code for the init command.
 */
export async function runInit(args: string[], options: RunInitOptions = {}): Promise<number> {
  // Use the provided stdout and stderr writers, or default to process.stdout and process.stderr.
  const stdout = options.stdout ?? ((text) => process.stdout.write(text));
  const stderr = options.stderr ?? ((text) => process.stderr.write(text));

  const interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const integrations = options.integrations ?? AGENT_INTEGRATIONS;
  const initHelp = getInitHelp(integrations);
  const parsed = parseInitArgs(args, integrations);

  // Handle the parsed arguments based on their kind.
  if (parsed.kind === "help") {
    stdout(initHelp);
    return 0;
  }

  if (parsed.kind === "invalid") {
    stderr(`${parsed.error ?? "Invalid init arguments."}\n\n${initHelp}`);
    return 1;
  }

  if (parsed.kind === "install") {
    return installSelected(parsed.ids, integrations, stdout, stderr);
  }

  // No arguments provided
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

  // Prompt the user for each integration and collect the selected IDs.
  try {
    const ids: string[] = [];
    for (const integration of integrations) {
      const answer = await prompt(`Install ${integration.name}? ${integration.description} [Y/n] `);
      if (isYes(answer)) {
        ids.push(integration.id);
      }
    }

    // No integrations selected
    if (ids.length === 0) {
      stdout("No integrations installed. You can run `codex-limits init` again later.\n");
      return 0;
    }

    return installSelected(ids, integrations, stdout, stderr);
  } catch {
    stderr("codex-limits init: Interactive setup failed.\n");
    return 1;
  } finally {
    // Close the prompt interface
    closePrompt(prompt);
  }
}

/**
 * Generate the help text for the `codex-limits init` command.
 * @param integrations - The list of available agent integrations.
 * @returns - The formatted help text for the init command.
 */
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
 * Parse the command-line arguments for the `codex-limits init` command.
 * @param args - The command-line arguments to parse.
 * @param integrations - The list of available agent integrations.
 * @returns - The parsed arguments as a `ParsedInitArgs` object.
 */
function parseInitArgs(args: readonly string[], integrations: AgentIntegration[]): ParsedInitArgs {
  // No arguments provided
  if (args.length === 0) {
    return {kind: "prompt", ids: []};
  }

  // Help flag provided
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    return {kind: "help", ids: []};
  }

  const integrationFlags = new Map(
    integrations.map((integration) => [`--${integration.id}`, integration.id])
  );
  const seen = new Set<string>();

  for (const arg of args) {
    if (!arg.startsWith("-")) {
      return {
        kind: "invalid",
        ids: [],
        error: `Unexpected init argument: ${sanitizeArguments([arg])}`,
      };
    }
    if (arg !== "--all" && !integrationFlags.has(arg)) {
      return {
        kind: "invalid",
        ids: [],
        error: `Unknown init option: ${sanitizeArguments([arg])}`,
      };
    }
    if (seen.has(arg)) {
      return {kind: "invalid", ids: [], error: `Duplicate init option: ${arg}`};
    }
    seen.add(arg);
  }

  if (seen.has("--all") && seen.size > 1) {
    return {
      kind: "invalid",
      ids: [],
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

/**
 * Install the selected agent integrations and report the results.
 * @param ids - The list of integration IDs to install.
 * @param integrations - The list of available agent integrations.
 * @param stdout - Output writer for stdout.
 * @param stderr - Output writer for stderr.
 * @returns - Exit code for the installation process (0 for success, 1 for failure).
 */
async function installSelected(
  ids: string[],
  integrations: AgentIntegration[],
  stdout: WriteOutput,
  stderr: WriteOutput
): Promise<number> {
  let failed = false;

  // Install each selected integration and report the results.
  for (const id of ids) {
    const integration = integrations.find((candidate) => candidate.id === id);
    if (!integration) {
      stderr(`Unknown integration: ${id}\n`);
      failed = true;
      continue;
    }

    // Attempt to install the integration and handle any errors.
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

/**
 * Creates a prompt for user input.
 * @returns - A function that prompts the user for input and returns a promise that resolves with the user's response.
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
 * Closes the prompt interface if it has a close method.
 * @param prompt - The prompt function to close.
 */
function closePrompt(prompt: (question: string) => Promise<string>): void {
  const maybeClose = prompt as Partial<Pick<Interface, "close">>;
  maybeClose.close?.();
}

/**
 * Determines if a user's answer to a yes/no question is affirmative.
 * @param answer - The user's input answer to a yes/no question.
 * @returns - True if the answer is considered a "yes" (case-insensitive), false otherwise.
 */
function isYes(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return normalized === "" || normalized === "y" || normalized === "yes";
}
