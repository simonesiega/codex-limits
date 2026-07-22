export type CommandSafety = "read-only" | "local-write" | "remote-mutation";
export type OptionValue = true | string | readonly string[];

export interface OptionDefinition {
  key: string;
  long: `--${string}`;
  short?: `-${string}`;
  description: string;
  kind: "boolean" | "value";
  valueName?: string;
  repeatable?: boolean;
  conflicts?: readonly string[];
  conflictMessage?: string;
  exclusive?: boolean;
  action?: "help" | "version";
  rootOnly?: boolean;
}

export interface PositionalDefinition {
  name: string;
  description: string;
  required?: boolean;
  variadic?: boolean;
  choices?: readonly string[];
}

export interface ParsedCommandValues {
  options: Readonly<Record<string, OptionValue>>;
  positionals: readonly string[];
}

export interface CommandValidationIssue {
  code: "conflicting-options" | "invalid-positional";
  message: string;
}

interface CommandDefinitionBase {
  id: string;
  path: readonly string[];
  aliases?: readonly (readonly string[])[];
  compatibility?: boolean;
  description: string;
  usage: readonly string[];
  options?: readonly OptionDefinition[];
  positionals?: readonly PositionalDefinition[];
  safetyNote: string;
  failureMessage: string | ((values: ParsedCommandValues) => string);
  validate?: (values: ParsedCommandValues) => CommandValidationIssue | null;
  execute: (values: ParsedCommandValues) => Promise<number>;
}

export interface ReadOnlyCommandDefinition extends CommandDefinitionBase {
  safety: "read-only";
}

export interface LocalWriteCommandDefinition extends CommandDefinitionBase {
  safety: "local-write";
}

export interface RemoteMutationCommandDefinition extends CommandDefinitionBase {
  safety: "remote-mutation";
  confirmation: {
    optionKey: string;
  };
}

export type CommandDefinition =
  ReadOnlyCommandDefinition | LocalWriteCommandDefinition | RemoteMutationCommandDefinition;

export interface CommandGroupDefinition {
  id: string;
  path: readonly string[];
  aliases?: readonly (readonly string[])[];
  description: string;
}

export type HelpSubject = CommandDefinition | CommandGroupDefinition | null;

export interface EnvironmentDefinition {
  name: string;
  description: string;
}

export interface CliProgramDefinition {
  name: string;
  description: string;
  environment: readonly EnvironmentDefinition[];
  safetyNotes: readonly string[];
}

export interface CommandRegistry {
  program: CliProgramDefinition;
  groups: readonly CommandGroupDefinition[];
  commands: readonly CommandDefinition[];
  globalOptions: readonly OptionDefinition[];
}

/** Shared JSON option used by every command that supports machine-readable output. */
export const JSON_OPTION: OptionDefinition = {
  key: "output.json",
  long: "--json",
  description: "Print JSON only",
  kind: "boolean",
};

/** Converts the shared output option into one consistent internal representation. */
export function getOutputFormat(values: ParsedCommandValues): "json" | "text" {
  return values.options[JSON_OPTION.key] === true ? "json" : "text";
}

/** Reads one parsed boolean option. */
export function hasOption(values: ParsedCommandValues, key: string): boolean {
  return values.options[key] === true;
}
