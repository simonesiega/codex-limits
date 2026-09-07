/**
 * @fileoverview Shell-completion renderers generated from the command registry. Each renderer applies the quoting and syntax rules of its target shell while preserving one shared command model.
 */
import type {
  CommandDefinition,
  CommandRegistry,
  OptionDefinition,
  PositionalDefinition,
} from "@/package/commands/command";

export const COMPLETION_SHELLS = ["bash", "zsh", "fish", "powershell", "nushell"] as const;

export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

type ContextCompletionShell = Exclude<CompletionShell, "nushell">;

interface CompletionCandidate {
  value: string;
  description: string;
}

interface CompletionContext {
  key: string;
  candidates: readonly CompletionCandidate[];
}

/** Generates a shell-native completion script from the validated command registry. */
export function formatShellCompletions(registry: CommandRegistry, shell: CompletionShell): string {
  if (shell === "nushell") {
    return formatNushell(registry);
  }

  const contexts = createCompletionContexts(registry);
  switch (shell) {
    case "bash":
      return formatBash(contexts);
    case "zsh":
      return formatZsh(contexts);
    case "fish":
      return formatFish(contexts);
    case "powershell":
      return formatPowerShell(contexts);
  }
}

function createCompletionContexts(registry: CommandRegistry): readonly CompletionContext[] {
  const contexts = new Map<string, Map<string, CompletionCandidate>>();
  const ensureContext = (path: readonly string[]) => {
    const key = path.join(" ");
    let candidates = contexts.get(key);
    if (!candidates) {
      candidates = new Map();
      contexts.set(key, candidates);
    }
    return candidates;
  };
  const addCandidate = (path: readonly string[], candidate: CompletionCandidate) => {
    const candidates = ensureContext(path);
    if (!candidates.has(candidate.value)) {
      candidates.set(candidate.value, candidate);
    }
  };

  ensureContext([]);
  const defaultCommand = registry.commands.find((command) => command.path.length === 0);
  addOptions(ensureContext([]), [...(defaultCommand?.options ?? []), ...registry.globalOptions]);

  for (const group of registry.groups) {
    for (const path of [group.path, ...(group.aliases ?? [])]) {
      const name = path.at(-1);
      if (name) {
        addCandidate(path.slice(0, -1), {value: name, description: group.description});
      }
      addOptions(
        ensureContext(path),
        registry.globalOptions.filter((option) => !option.rootOnly)
      );
    }
  }

  for (const command of registry.commands) {
    if (command.path.length === 0) {
      continue;
    }
    for (const path of [command.path, ...(command.aliases ?? [])]) {
      const name = path.at(-1);
      if (name) {
        addCandidate(path.slice(0, -1), {value: name, description: command.description});
      }
      const candidates = ensureContext(path);
      addOptions(candidates, [
        ...(command.options ?? []),
        ...registry.globalOptions.filter((option) => !option.rootOnly),
      ]);
      for (const positional of command.positionals ?? []) {
        for (const choice of positional.choices ?? []) {
          if (!candidates.has(choice)) {
            candidates.set(choice, {value: choice, description: positional.description});
          }
        }
      }
    }
  }

  return [...contexts.entries()]
    .sort(([left], [right]) => (left === right ? 0 : left < right ? -1 : 1))
    .map(([key, candidates]) => ({key, candidates: [...candidates.values()]}));
}

function addOptions(
  candidates: Map<string, CompletionCandidate>,
  options: readonly OptionDefinition[]
): void {
  for (const option of options) {
    for (const value of option.short ? [option.long, option.short] : [option.long]) {
      if (!candidates.has(value)) {
        candidates.set(value, {value, description: option.description});
      }
    }
  }
}

function formatBash(contexts: readonly CompletionContext[]): string {
  return `${[
    "# bash completion for codex-limits",
    "_codex_limits_completion() {",
    '  local cur="${COMP_WORDS[COMP_CWORD]}"',
    '  local context=""',
    "  local word",
    "  local i",
    "  for ((i = 1; i < COMP_CWORD; i++)); do",
    '    word="${COMP_WORDS[i]}"',
    '    case "${context}:${word}" in',
    ...formatTransitions(contexts, "bash"),
    "    esac",
    "  done",
    "  local candidates",
    '  case "$context" in',
    ...contexts.flatMap((context) => [
      `    ${quoteBash(context.key)})`,
      `      candidates=${quoteBash(context.candidates.map(({value}) => value).join(" "))}`,
      "      ;;",
    ]),
    "  esac",
    '  COMPREPLY=($(compgen -W "$candidates" -- "$cur"))',
    "}",
    "complete -F _codex_limits_completion codex-limits",
  ].join("\n")}\n`;
}

function formatZsh(contexts: readonly CompletionContext[]): string {
  return `${[
    "#compdef codex-limits",
    "",
    "_codex_limits() {",
    '  local context=""',
    "  local word",
    "  local i",
    "  local -a candidates",
    "  for ((i = 2; i < CURRENT; i++)); do",
    '    word="${words[i]}"',
    '    case "${context}:${word}" in',
    ...formatTransitions(contexts, "zsh"),
    "    esac",
    "  done",
    '  case "$context" in',
    ...contexts.flatMap((context) => [
      `    ${quoteZsh(context.key)})`,
      "      candidates=(",
      ...context.candidates.map(
        ({value, description}) => `        ${quoteZsh(`${value}:${description}`)}`
      ),
      "      )",
      "      ;;",
    ]),
    "  esac",
    "  _describe 'codex-limits' candidates",
    "}",
    "",
    "compdef _codex_limits codex-limits",
  ].join("\n")}\n`;
}

function formatFish(contexts: readonly CompletionContext[]): string {
  const contextId = (key: string) => (key ? key.replaceAll(" ", "/") : "__root__");
  return `${[
    "# fish completion for codex-limits",
    "function __codex_limits_context",
    "    set -l context __root__",
    "    set -l tokens (commandline -opc)",
    "    if test (count $tokens) -gt 0",
    "        set -e tokens[1]",
    "    end",
    "    for word in $tokens",
    '        switch "$context:$word"',
    ...formatTransitions(contexts, "fish"),
    "        end",
    "    end",
    "    echo $context",
    "end",
    "",
    ...contexts.flatMap((context) =>
      context.candidates.map(
        ({value, description}) =>
          `complete -c codex-limits -f -n ${quoteFish(`test (__codex_limits_context) = ${contextId(context.key)}`)} -a ${quoteFish(value)} -d ${quoteFish(description)}`
      )
    ),
  ].join("\n")}\n`;
}

function formatPowerShell(contexts: readonly CompletionContext[]): string {
  return `${[
    "# PowerShell completion for codex-limits",
    "Register-ArgumentCompleter -Native -CommandName codex-limits -ScriptBlock {",
    "    param($wordToComplete, $commandAst, $cursorPosition)",
    "    $context = ''",
    "    $elements = @($commandAst.CommandElements | Select-Object -Skip 1)",
    "    $completedCount = $elements.Count",
    "    if ($wordToComplete.Length -gt 0) { $completedCount -= 1 }",
    "    for ($i = 0; $i -lt $completedCount; $i += 1) {",
    "        $word = $elements[$i].Extent.Text",
    '        switch ("${context}:${word}") {',
    ...formatTransitions(contexts, "powershell"),
    "        }",
    "    }",
    "    $candidates = switch ($context) {",
    ...contexts.flatMap((context) => [
      `        ${quotePowerShell(context.key)} {`,
      ...context.candidates.map(
        ({value, description}) =>
          `            [pscustomobject]@{ Value = ${quotePowerShell(value)}; Description = ${quotePowerShell(description)} }`
      ),
      "        }",
    ]),
    "    }",
    "    $candidates | Where-Object {",
    "        $_.Value.StartsWith($wordToComplete, [System.StringComparison]::OrdinalIgnoreCase)",
    "    } | ForEach-Object {",
    "        [System.Management.Automation.CompletionResult]::new(",
    "            $_.Value, $_.Value, 'ParameterValue', $_.Description",
    "        )",
    "    }",
    "}",
  ].join("\n")}\n`;
}

function formatNushell(registry: CommandRegistry): string {
  const defaultCommand = registry.commands.find((command) => command.path.length === 0);
  const completers = registry.commands.flatMap((command) =>
    (command.positionals ?? []).flatMap((positional) =>
      positional.choices?.length ? formatNushellCompleter(registry, command, positional) : []
    )
  );
  const externs = [
    ...formatNushellExtern(
      registry.program.name,
      defaultCommand?.positionals ?? [],
      [...(defaultCommand?.options ?? []), ...registry.globalOptions],
      defaultCommand,
      registry
    ),
    ...registry.groups.flatMap((group) =>
      [group.path, ...(group.aliases ?? [])].flatMap((path) =>
        formatNushellExtern(
          `${registry.program.name} ${path.join(" ")}`,
          [],
          registry.globalOptions.filter((option) => !option.rootOnly)
        )
      )
    ),
    ...registry.commands.flatMap((command) =>
      command.path.length === 0
        ? []
        : [command.path, ...(command.aliases ?? [])].flatMap((path) =>
            formatNushellExtern(
              `${registry.program.name} ${path.join(" ")}`,
              command.positionals ?? [],
              [
                ...(command.options ?? []),
                ...registry.globalOptions.filter((option) => !option.rootOnly),
              ],
              command,
              registry
            )
          )
    ),
  ];

  return `${[
    "# Nushell completions for codex-limits",
    "# Generated from the codex-limits command registry.",
    "",
    ...completers,
    ...externs,
  ].join("\n")}\n`;
}

function formatNushellCompleter(
  registry: CommandRegistry,
  command: CommandDefinition,
  positional: PositionalDefinition
): string[] {
  return [
    `def ${quoteNushell(nushellCompleterName(registry, command, positional))} [] {`,
    "    [",
    ...(positional.choices ?? []).map(
      (choice) =>
        `        { value: ${quoteNushell(choice)}, description: ${quoteNushell(positional.description)} }`
    ),
    "    ]",
    "}",
    "",
  ];
}

function formatNushellExtern(
  name: string,
  positionals: readonly PositionalDefinition[],
  options: readonly OptionDefinition[],
  command?: CommandDefinition,
  registry?: CommandRegistry
): string[] {
  return [
    `export extern ${quoteNushell(name)} [`,
    ...positionals.map((positional) => {
      const prefix = positional.variadic ? "..." : "";
      const optional = positional.required || positional.variadic ? "" : "?";
      const completer =
        positional.choices?.length && command && registry
          ? `@${quoteNushell(nushellCompleterName(registry, command, positional))}`
          : "";
      return `    ${prefix}${positional.name.replaceAll("-", "_")}${optional}: string${completer} # ${positional.description}`;
    }),
    ...options.map((option) => {
      const short = option.short ? `(${option.short})` : "";
      const value = option.kind === "value" ? ": string" : "";
      return `    ${option.long}${short}${value} # ${option.description}`;
    }),
    "]",
    "",
  ];
}

function nushellCompleterName(
  registry: CommandRegistry,
  command: CommandDefinition,
  positional: PositionalDefinition
): string {
  return ["nu-complete", registry.program.name, ...command.path, positional.name].join(" ");
}

function formatTransitions(
  contexts: readonly CompletionContext[],
  shell: ContextCompletionShell
): string[] {
  const contextKeys = new Set(contexts.map(({key}) => key));
  const transitions: Array<{from: string; word: string; to: string}> = [];
  for (const {key, candidates} of contexts) {
    for (const {value} of candidates) {
      if (value.startsWith("-")) {
        continue;
      }
      const next = key ? `${key} ${value}` : value;
      if (contextKeys.has(next)) {
        transitions.push({from: key, word: value, to: next});
      }
    }
  }

  return transitions.map(({from, word, to}) => {
    const match = `${from}:${word}`;
    switch (shell) {
      case "bash":
        return `      ${quoteBash(match)}) context=${quoteBash(to)} ;;`;
      case "zsh":
        return `      ${quoteZsh(match)}) context=${quoteZsh(to)} ;;`;
      case "fish":
        return `            case ${quoteFish(`${from ? from.replaceAll(" ", "/") : "__root__"}:${word}`)}\n                set context ${quoteFish(to.replaceAll(" ", "/"))}`;
      case "powershell":
        return `            ${quotePowerShell(match)} { $context = ${quotePowerShell(to)}; continue }`;
    }
  });
}

function quoteBash(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function quoteZsh(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function quoteFish(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteNushell(value: string): string {
  return JSON.stringify(value);
}
