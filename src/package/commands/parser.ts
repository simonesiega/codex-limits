import {
  type CommandDefinition,
  type CommandGroupDefinition,
  type CommandRegistry,
  type HelpSubject,
  type OptionDefinition,
  type OptionValue,
  type ParsedCommandValues,
} from "@/package/commands/command";
import {sanitizeArguments} from "@/package/commands/safe-error";

export interface CliParseError {
  code:
    | "conflicting-options"
    | "duplicate-option"
    | "invalid-option-value"
    | "invalid-positional"
    | "missing-option-value"
    | "missing-positional"
    | "unexpected-positional"
    | "unknown-command"
    | "unknown-option";
  message: string;
  input: string;
}

export type CliParseResult =
  | {kind: "command"; command: CommandDefinition; values: ParsedCommandValues}
  | {kind: "error"; error: CliParseError; subject: HelpSubject}
  | {kind: "help"; subject: HelpSubject}
  | {kind: "version"};

interface RawOption {
  name: string;
  token: string;
  value: true | string;
}

interface ScannedArguments {
  operands: string[];
  options: RawOption[];
  error: CliParseError | null;
}

type ResolvedSubject =
  | {kind: "command"; command: CommandDefinition; positionalValues: string[]}
  | {kind: "group"; group: CommandGroupDefinition}
  | {kind: "unknown"; message: string};

/** Parses arguments using metadata from a validated command registry. */
export function parseCliArguments(
  registry: CommandRegistry,
  args: readonly string[]
): CliParseResult {
  const input = sanitizeArguments(args);
  // Scan with every registered option shape so value options can appear before the command path.
  const scanned = scanArguments(registry, args, input);
  const resolved = resolveSubject(registry, scanned.operands, input);
  if (scanned.error) {
    const subject =
      resolved.kind === "command"
        ? toHelpSubject(resolved.command)
        : resolved.kind === "group"
          ? resolved.group
          : null;
    return {kind: "error", error: scanned.error, subject};
  }
  if (resolved.kind === "unknown") {
    return {
      kind: "error",
      error: parseError("unknown-command", resolved.message, input),
      subject: null,
    };
  }

  const subject = resolved.kind === "command" ? resolved.command : resolved.group;
  const selectedOptions = [
    ...(resolved.kind === "command" ? (resolved.command.options ?? []) : []),
    ...registry.globalOptions.filter(
      (option) =>
        !option.rootOnly || (resolved.kind === "command" && resolved.command.path.length === 0)
    ),
  ];
  const parsedOptions = parseSelectedOptions(scanned.options, selectedOptions, subject, input);
  if ("error" in parsedOptions) {
    return {kind: "error", error: parsedOptions.error, subject: toHelpSubject(subject)};
  }

  const values: ParsedCommandValues = {
    options: parsedOptions.values,
    positionals: resolved.kind === "command" ? resolved.positionalValues : [],
  };
  const action = findOptionAction(scanned.options, selectedOptions);
  if (action === "help") {
    return {
      kind: "help",
      subject: toHelpSubject(subject),
    };
  }
  if (action === "version") {
    return {kind: "version"};
  }
  if (resolved.kind === "group") {
    return {kind: "help", subject: resolved.group};
  }

  const positionalError = validatePositionals(resolved.command, values.positionals, input);
  if (positionalError) {
    return {kind: "error", error: positionalError, subject: toHelpSubject(resolved.command)};
  }

  const validationIssue = resolved.command.validate?.(values);
  if (validationIssue) {
    return {
      kind: "error",
      error: parseError(validationIssue.code, validationIssue.message, input),
      subject: toHelpSubject(resolved.command),
    };
  }

  return {kind: "command", command: resolved.command, values};
}

function scanArguments(
  registry: CommandRegistry,
  args: readonly string[],
  input: string
): ScannedArguments {
  const optionShapes = collectOptionShapes(registry);
  const operands: string[] = [];
  const options: RawOption[] = [];
  // Continue after the first syntax error so resolution can still select contextual help.
  let firstError: CliParseError | null = null;
  let positionalOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) {
      continue;
    }
    if (positionalOnly) {
      operands.push(token);
      continue;
    }
    if (token === "--") {
      positionalOnly = true;
      continue;
    }
    if (!isOptionToken(token)) {
      operands.push(token);
      continue;
    }

    const {name, inlineValue} = splitOptionToken(token);
    const shape = optionShapes.get(name);
    if (!shape) {
      options.push({name, token, value: inlineValue ?? true});
      continue;
    }
    if (shape.kind === "boolean") {
      if (inlineValue !== undefined) {
        firstError ??= parseError(
          "invalid-option-value",
          `Option ${name} does not accept a value.`,
          input
        );
      } else {
        options.push({name, token, value: true});
      }
      continue;
    }

    if (inlineValue !== undefined) {
      if (inlineValue.length === 0) {
        firstError ??= missingOptionValue(name, shape.valueName, input);
      } else {
        options.push({name, token, value: inlineValue});
      }
      continue;
    }

    const value = args[index + 1];
    if (value === undefined || value === "--" || isOptionToken(value)) {
      firstError ??= missingOptionValue(name, shape.valueName, input);
      continue;
    }
    options.push({name, token, value});
    index += 1;
  }

  return {operands, options, error: firstError};
}

function resolveSubject(
  registry: CommandRegistry,
  operands: readonly string[],
  input: string
): ResolvedSubject {
  const commandMatch = findLongestPathMatch(registry.commands, operands);
  if (commandMatch) {
    return {
      kind: "command",
      command: commandMatch.definition,
      positionalValues: operands.slice(commandMatch.length),
    };
  }

  const defaultCommand = registry.commands.find((command) => command.path.length === 0);
  if (operands.length === 0 && defaultCommand) {
    return {kind: "command", command: defaultCommand, positionalValues: []};
  }

  const exactGroup = findExactPathMatch(registry.groups, operands);
  if (exactGroup) {
    return {kind: "group", group: exactGroup};
  }

  const groupPrefix = findLongestPathMatch(registry.groups, operands);
  if (groupPrefix) {
    const unknownPart = operands[groupPrefix.length];
    const groupName = groupPrefix.definition.path.join(" ");
    return {
      kind: "unknown",
      message: unknownPart
        ? `Unknown ${groupName} command: ${sanitizeArguments([unknownPart])}`
        : `Unknown command or option: ${input}`,
    };
  }

  // Group typos stay contextual; only unmatched root operands fall back to default positionals.
  if (defaultCommand && (defaultCommand.positionals?.length ?? 0) > 0) {
    return {kind: "command", command: defaultCommand, positionalValues: [...operands]};
  }

  return {kind: "unknown", message: `Unknown command or option: ${input}`};
}

function parseSelectedOptions(
  rawOptions: readonly RawOption[],
  selectedOptions: readonly OptionDefinition[],
  subject: Exclude<HelpSubject, null>,
  input: string
): {values: Readonly<Record<string, OptionValue>>} | {error: CliParseError} {
  const bySpelling = mapOptionsBySpelling(selectedOptions);
  const seen = new Map<string, {definition: OptionDefinition; token: string}>();
  const values: Record<string, OptionValue> = {};

  for (const raw of rawOptions) {
    const definition = bySpelling.get(raw.name);
    if (!definition) {
      return {
        error: parseError(
          "unknown-option",
          `Unknown ${optionSubject(subject)}option: ${sanitizeArguments([raw.token])}`,
          input
        ),
      };
    }

    const previous = seen.get(definition.key);
    if (previous && !definition.repeatable) {
      return {
        error: parseError(
          "duplicate-option",
          `Duplicate ${optionSubject(subject)}option: ${sanitizeArguments([raw.token])}`,
          input
        ),
      };
    }

    if (definition.repeatable) {
      const existing = values[definition.key];
      const repeated = Array.isArray(existing) ? [...existing] : [];
      if (typeof raw.value === "string") {
        repeated.push(raw.value);
      }
      values[definition.key] = repeated;
    } else {
      values[definition.key] = raw.value;
    }
    seen.set(definition.key, {definition, token: raw.token});
  }

  // Conflict keys make long and short spellings behave as one logical option.
  for (const {definition, token} of seen.values()) {
    if (definition.exclusive && seen.size > 1) {
      return {
        error: parseError(
          "conflicting-options",
          `Option ${sanitizeArguments([token])} cannot be combined with other options.`,
          input
        ),
      };
    }
    for (const conflict of definition.conflicts ?? []) {
      const conflicting = seen.get(conflict);
      if (!conflicting) {
        continue;
      }
      return {
        error: parseError(
          "conflicting-options",
          definition.conflictMessage ??
            `Options ${sanitizeArguments([token])} and ${sanitizeArguments([conflicting.token])} cannot be combined.`,
          input
        ),
      };
    }
  }

  return {values};
}

function validatePositionals(
  command: CommandDefinition,
  values: readonly string[],
  input: string
): CliParseError | null {
  const definitions = command.positionals ?? [];
  let valueIndex = 0;

  for (const definition of definitions) {
    const count = definition.variadic
      ? values.length - valueIndex
      : valueIndex < values.length
        ? 1
        : 0;
    if (definition.required && count === 0) {
      return parseError(
        "missing-positional",
        `Missing required ${definition.name} for ${subjectLabel(command)}.`,
        input
      );
    }

    const selectedValues = values.slice(valueIndex, valueIndex + count);
    for (const value of selectedValues) {
      if (definition.choices && !definition.choices.includes(value)) {
        return parseError(
          "invalid-positional",
          `Unknown ${definition.name}: ${sanitizeArguments([value])}. Expected one of: ${definition.choices.join(", ")}.`,
          input
        );
      }
    }
    valueIndex += count;
  }

  const unexpected = values[valueIndex];
  return unexpected === undefined
    ? null
    : parseError(
        "unexpected-positional",
        `Unexpected ${subjectLabel(command)} argument: ${sanitizeArguments([unexpected])}`,
        input
      );
}

function findOptionAction(
  rawOptions: readonly RawOption[],
  selectedOptions: readonly OptionDefinition[]
): OptionDefinition["action"] {
  const bySpelling = mapOptionsBySpelling(selectedOptions);
  for (const raw of rawOptions) {
    const action = bySpelling.get(raw.name)?.action;
    if (action) {
      return action;
    }
  }
  return undefined;
}

function collectOptionShapes(registry: CommandRegistry): Map<string, OptionDefinition> {
  const shapes = new Map<string, OptionDefinition>();
  for (const definition of [
    ...registry.globalOptions,
    ...registry.commands.flatMap((command) => command.options ?? []),
  ]) {
    shapes.set(definition.long, definition);
    if (definition.short) {
      shapes.set(definition.short, definition);
    }
  }
  return shapes;
}

function mapOptionsBySpelling(options: readonly OptionDefinition[]): Map<string, OptionDefinition> {
  const result = new Map<string, OptionDefinition>();
  for (const option of options) {
    result.set(option.long, option);
    if (option.short) {
      result.set(option.short, option);
    }
  }
  return result;
}

function findLongestPathMatch<
  T extends {path: readonly string[]; aliases?: readonly (readonly string[])[]},
>(definitions: readonly T[], operands: readonly string[]): {definition: T; length: number} | null {
  let match: {definition: T; length: number} | null = null;
  for (const definition of definitions) {
    for (const path of [definition.path, ...(definition.aliases ?? [])]) {
      if (
        path.length > 0 &&
        path.length <= operands.length &&
        path.every((part, index) => operands[index] === part) &&
        (!match || path.length > match.length)
      ) {
        match = {definition, length: path.length};
      }
    }
  }
  return match;
}

function findExactPathMatch<
  T extends {path: readonly string[]; aliases?: readonly (readonly string[])[]},
>(definitions: readonly T[], operands: readonly string[]): T | null {
  for (const definition of definitions) {
    for (const path of [definition.path, ...(definition.aliases ?? [])]) {
      if (
        path.length === operands.length &&
        path.every((part, index) => operands[index] === part)
      ) {
        return definition;
      }
    }
  }
  return null;
}

function splitOptionToken(token: string): {name: string; inlineValue?: string} {
  const separator = token.indexOf("=");
  return separator < 0
    ? {name: token}
    : {name: token.slice(0, separator), inlineValue: token.slice(separator + 1)};
}

function isOptionToken(value: string): boolean {
  return value.length > 1 && value.startsWith("-");
}

function missingOptionValue(
  name: string,
  valueName: string | undefined,
  input: string
): CliParseError {
  return parseError(
    "missing-option-value",
    `Option ${name} requires a <${valueName ?? "value"}> value.`,
    input
  );
}

function toHelpSubject(subject: Exclude<HelpSubject, null>): HelpSubject {
  return "safety" in subject && subject.path.length === 0 ? null : subject;
}

function subjectLabel(subject: Exclude<HelpSubject, null>): string {
  return subject.path.length > 0 ? subject.path.join(" ") : "root";
}

function optionSubject(subject: Exclude<HelpSubject, null>): string {
  return subject.path.length > 0 ? `${subject.path.join(" ")} ` : "";
}

function parseError(code: CliParseError["code"], message: string, input: string): CliParseError {
  return {code, message, input};
}
