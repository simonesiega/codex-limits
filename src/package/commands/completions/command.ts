import type {ReadOnlyCommandDefinition} from "@/package/commands/command";
import {COMPLETION_SHELLS, type CompletionShell} from "@/package/commands/completions/format";
import type {CliIo} from "@/package/commands/runtime";

interface CompletionsCommandDependencies {
  io: Pick<CliIo, "stdout">;
  generate: (shell: CompletionShell) => string;
}

/** Creates the command that prints shell-native completion scripts. */
export function createCompletionsCommand(
  dependencies: CompletionsCommandDependencies
): ReadOnlyCommandDefinition {
  return {
    id: "completions",
    path: ["completions"],
    description: "Generate a shell completion script",
    usage: ["codex-limits completions <shell>"],
    positionals: [
      {
        name: "shell",
        description: `Shell name (${COMPLETION_SHELLS.join(", ")})`,
        required: true,
        choices: COMPLETION_SHELLS,
      },
    ],
    safety: "read-only",
    safetyNote: "Prints a completion script without reading Codex data or modifying files.",
    failureMessage: "Could not generate shell completions.",
    async execute(values) {
      const shell = values.positionals[0];
      if (!isCompletionShell(shell)) {
        throw new Error("Invalid completion shell.");
      }
      dependencies.io.stdout(dependencies.generate(shell));
      return 0;
    },
  };
}

function isCompletionShell(value: string | undefined): value is CompletionShell {
  return typeof value === "string" && COMPLETION_SHELLS.some((shell) => shell === value);
}
