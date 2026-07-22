import type {
  CommandDefinition,
  CommandGroupDefinition,
  CommandRegistry,
  HelpSubject,
  OptionDefinition,
  PositionalDefinition,
} from "@/package/commands/command";

/** Generates root, group, or command help entirely from the command registry. */
export function formatHelp(registry: CommandRegistry, subject: HelpSubject = null): string {
  if (!subject) {
    return formatRootHelp(registry);
  }
  return "safety" in subject
    ? formatCommandHelp(registry, subject)
    : formatGroupHelp(registry, subject);
}

function formatRootHelp(registry: CommandRegistry): string {
  const {program} = registry;
  const defaultCommand = registry.commands.find((command) => command.path.length === 0);
  const topLevelCommands = registry.commands.filter((command) => command.path.length === 1);
  const primaryCommands = topLevelCommands.filter((command) => !command.compatibility);
  const compatibilityCommands = topLevelCommands.filter((command) => command.compatibility);
  const topLevelGroups = registry.groups.filter((group) => group.path.length === 1);
  const usage = [
    ...(defaultCommand?.usage ?? []),
    ...primaryCommands.flatMap((command) => command.usage.slice(0, 1)),
    ...topLevelGroups.map((group) => `${program.name} ${group.path.join(" ")} <command>`),
    ...compatibilityCommands.flatMap((command) => command.usage.slice(0, 1)),
    `${program.name} --help`,
    `${program.name} --version`,
  ];
  // Keep compatibility commands discoverable without placing them before preferred commands.
  const commands = [
    ...primaryCommands.map((command) => ({name: command.path[0] ?? "", ...command})),
    ...topLevelGroups.map((group) => ({name: group.path[0] ?? "", ...group})),
    ...compatibilityCommands.map((command) => ({name: command.path[0] ?? "", ...command})),
  ];
  const argumentsSection = formatArgumentsSection(defaultCommand?.positionals ?? []);
  const options = [...(defaultCommand?.options ?? []), ...registry.globalOptions];

  return `${program.name}

  ${program.description}

  Usage:
${formatLines(usage)}
${argumentsSection}
  Commands:
${formatDefinitionLines(commands)}

  Options:
${formatOptionLines(options)}

  Environment:
${formatDefinitionLines(program.environment)}

  Safety:
${formatLines(program.safetyNotes)}
`;
}

function formatGroupHelp(registry: CommandRegistry, group: CommandGroupDefinition): string {
  const commandName = `${registry.program.name} ${group.path.join(" ")}`;
  const children = registry.commands
    .filter(
      (command) =>
        command.path.length === group.path.length + 1 &&
        group.path.every((part, index) => command.path[index] === part)
    )
    .map((command) => ({name: command.path.at(-1) ?? "", ...command}));
  const nestedGroups = registry.groups
    .filter(
      (candidate) =>
        candidate.path.length === group.path.length + 1 &&
        group.path.every((part, index) => candidate.path[index] === part)
    )
    .map((candidate) => ({name: candidate.path.at(-1) ?? "", ...candidate}));
  const globalOptions = registry.globalOptions.filter((option) => !option.rootOnly);

  return `${commandName}

  ${group.description}

  Usage:
${formatLines([`${commandName} <command>`, `${commandName} --help`])}

  Commands:
${formatDefinitionLines([...children, ...nestedGroups])}

  Options:
${formatOptionLines(globalOptions)}
`;
}

function formatCommandHelp(registry: CommandRegistry, command: CommandDefinition): string {
  const commandName =
    command.path.length === 0
      ? registry.program.name
      : `${registry.program.name} ${command.path.join(" ")}`;
  const argumentsSection = formatArgumentsSection(command.positionals ?? []);
  const globalOptions = registry.globalOptions.filter(
    (option) => !option.rootOnly || command.path.length === 0
  );
  const options = [...(command.options ?? []), ...globalOptions];

  return `${commandName}

  ${command.description}

  Usage:
${formatLines(command.usage)}
${argumentsSection}
  Options:
${formatOptionLines(options)}

  Safety:
${formatLines([command.safetyNote])}
`;
}

function formatArgumentsSection(positionals: readonly PositionalDefinition[]): string {
  return positionals.length > 0
    ? `
  Arguments:
${formatDefinitionLines(
  positionals.map((positional) => ({
    name: formatPositionalName(positional),
    description: positional.description,
  }))
)}
`
    : "";
}

function formatPositionalName(positional: PositionalDefinition): string {
  const name = positional.variadic ? `<${positional.name}...>` : `<${positional.name}>`;
  return positional.required ? name : `[${name}]`;
}

function formatOptionLines(options: readonly OptionDefinition[]): string {
  return formatDefinitionLines(
    options.map((option) => ({
      name: formatOptionName(option),
      description: option.description,
    }))
  );
}

function formatOptionName(option: OptionDefinition): string {
  const value = option.kind === "value" ? ` <${option.valueName}>` : "";
  return option.short ? `${option.short}, ${option.long}${value}` : `${option.long}${value}`;
}

function formatDefinitionLines(
  definitions: readonly {name: string; description: string}[]
): string {
  const width = Math.max(0, ...definitions.map((definition) => definition.name.length));
  return definitions
    .map((definition) => `    ${definition.name.padEnd(width)}  ${definition.description}`)
    .join("\n");
}

function formatLines(lines: readonly string[]): string {
  return lines.map((line) => `    ${line}`).join("\n");
}
