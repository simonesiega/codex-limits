import type {
  CommandDefinition,
  CommandRegistry,
  OptionDefinition,
} from "@/package/commands/command";

/** Rejects command metadata that could create ambiguous or unsafe CLI behavior. */
export function assertValidCommandRegistry(registry: CommandRegistry): void {
  assertValidProgramMetadata(registry);

  const definitionIds = new Set<string>();
  const registeredPaths = new Set<string>();
  let defaultCommands = 0;

  for (const group of registry.groups) {
    assertDefinitionId(group.id, "command group");
    assertSafeMetadataText(group.description, `Command group ${group.id} description`);
    registerDefinitionId(group.id, definitionIds);
    if (group.path.length === 0) {
      throw new Error(`Command group ${group.id} must have a non-empty path.`);
    }
    registerPaths(group.id, [group.path, ...(group.aliases ?? [])], registeredPaths);
  }

  for (const command of registry.commands) {
    assertDefinitionId(command.id, "command");
    assertValidCommandMetadata(command, registry.program.name);
    registerDefinitionId(command.id, definitionIds);
    if (command.path.length === 0) {
      defaultCommands += 1;
      if (command.safety !== "read-only") {
        throw new Error("The default command must be read-only.");
      }
    }
    registerPaths(command.id, [command.path, ...(command.aliases ?? [])], registeredPaths);
    assertValidOptions(command.options ?? [], command.id, false);
    assertValidPositionals(command);
    assertRemoteMutationConfirmation(command);
  }

  if (defaultCommands !== 1) {
    throw new Error("The command registry must contain exactly one default command.");
  }
  assertValidOptions(registry.globalOptions, "global options", true);
  assertUniqueGlobalActions(registry);
  // Argument scanning happens before command resolution, so shared spellings must agree on shape.
  assertCompatibleOptionSpellings(registry);
  assertGlobalOptionsDoNotOverlap(registry);
  // Explicit parent groups keep nested parsing and generated group help synchronized.
  assertNestedCommandsHaveGroups(registry);
}

function assertValidProgramMetadata(registry: CommandRegistry): void {
  const {program} = registry;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(program.name)) {
    throw new Error(`Invalid CLI program name: ${program.name}.`);
  }
  assertSafeMetadataText(program.description, "CLI program description");
  if (program.safetyNotes.length === 0) {
    throw new Error("The CLI program must declare at least one safety note.");
  }
  for (const note of program.safetyNotes) {
    assertSafeMetadataText(note, "CLI safety note");
  }

  const environmentNames = new Set<string>();
  for (const variable of program.environment) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(variable.name) || environmentNames.has(variable.name)) {
      throw new Error(`Invalid or duplicate environment variable metadata: ${variable.name}.`);
    }
    assertSafeMetadataText(
      variable.description,
      `Environment variable ${variable.name} description`
    );
    environmentNames.add(variable.name);
  }
}

function assertValidCommandMetadata(command: CommandDefinition, programName: string): void {
  if (command.compatibility && command.path.length === 0) {
    throw new Error("The default command cannot be a compatibility command.");
  }
  assertSafeMetadataText(command.description, `Command ${command.id} description`);
  assertSafeMetadataText(command.safetyNote, `Command ${command.id} safety note`);
  if (typeof command.failureMessage === "string") {
    assertSafeMetadataText(command.failureMessage, `Command ${command.id} failure message`);
  }
  if (command.usage.length === 0) {
    throw new Error(`Command ${command.id} must declare usage.`);
  }

  const usageLines = new Set<string>();
  const commandName = [programName, ...command.path].join(" ");
  for (const usage of command.usage) {
    assertSafeMetadataText(usage, `Command ${command.id} usage`, 240);
    if ((usage !== commandName && !usage.startsWith(`${commandName} `)) || usageLines.has(usage)) {
      throw new Error(`Command ${command.id} contains invalid or duplicate usage.`);
    }
    usageLines.add(usage);
  }
}

function assertValidOptions(
  options: readonly OptionDefinition[],
  owner: string,
  global: boolean
): void {
  const keys = new Set<string>();
  const spellings = new Set<string>();

  for (const option of options) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(option.key)) {
      throw new Error(`${owner} contains invalid option key ${option.key}.`);
    }
    if (keys.has(option.key)) {
      throw new Error(`${owner} contains duplicate option key ${option.key}.`);
    }
    keys.add(option.key);
    assertSafeMetadataText(option.description, `Option ${option.long} description`);

    const optionSpellings: string[] = option.short ? [option.long, option.short] : [option.long];
    for (const spelling of optionSpellings) {
      const valid =
        spelling === option.short
          ? /^-[a-z0-9]$/.test(spelling)
          : /^--[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spelling);
      if (!valid) {
        throw new Error(`${owner} contains invalid option ${spelling}.`);
      }
      if (spellings.has(spelling)) {
        throw new Error(`${owner} contains duplicate option ${spelling}.`);
      }
      spellings.add(spelling);
    }

    if (option.kind === "boolean" && (option.valueName || option.repeatable)) {
      throw new Error(`Boolean option ${option.long} has value-only metadata.`);
    }
    if (
      option.kind === "value" &&
      (!option.valueName || !/^[a-z][a-z0-9-]*$/.test(option.valueName))
    ) {
      throw new Error(`Value option ${option.long} must declare a valid value name.`);
    }
    if (option.action && option.kind !== "boolean") {
      throw new Error(`Action option ${option.long} must be boolean.`);
    }
    if (option.action && !option.exclusive) {
      throw new Error(`Action option ${option.long} must be exclusive.`);
    }
    if (!global && (option.action || option.rootOnly)) {
      throw new Error(`Command option ${option.long} contains global-only metadata.`);
    }
    if (option.conflictMessage) {
      assertSafeMetadataText(option.conflictMessage, `Option ${option.long} conflict message`);
      if (!option.conflicts?.length) {
        throw new Error(`Option ${option.long} has a conflict message without conflicts.`);
      }
    }
  }

  for (const option of options) {
    const conflicts = new Set<string>();
    for (const conflict of option.conflicts ?? []) {
      if (!keys.has(conflict)) {
        throw new Error(
          `Option ${option.long} in ${owner} references unknown conflict ${conflict}.`
        );
      }
      if (conflict === option.key || conflicts.has(conflict)) {
        throw new Error(`Option ${option.long} in ${owner} has an invalid conflict list.`);
      }
      conflicts.add(conflict);
    }
  }
}

function assertUniqueGlobalActions(registry: CommandRegistry): void {
  const actions = new Set<NonNullable<OptionDefinition["action"]>>();
  for (const option of registry.globalOptions) {
    if (option.action && actions.has(option.action)) {
      throw new Error(`Duplicate global option action: ${option.action}.`);
    }
    if (option.action) {
      actions.add(option.action);
    }
  }
}

function assertValidPositionals(command: CommandDefinition): void {
  const positionals = command.positionals ?? [];
  const names = new Set<string>();
  for (const positional of positionals) {
    if (!/^[a-z][a-z0-9-]*$/.test(positional.name) || names.has(positional.name)) {
      throw new Error(`Command ${command.id} contains an invalid or duplicate positional name.`);
    }
    assertSafeMetadataText(
      positional.description,
      `Command ${command.id} positional ${positional.name} description`
    );
    const choices = new Set<string>();
    for (const choice of positional.choices ?? []) {
      assertSafeMetadataText(choice, `Command ${command.id} positional choice`, 100);
      if (choices.has(choice)) {
        throw new Error(`Command ${command.id} contains a duplicate positional choice.`);
      }
      choices.add(choice);
    }
    names.add(positional.name);
  }

  const variadicIndex = positionals.findIndex((positional) => positional.variadic);
  if (variadicIndex >= 0 && variadicIndex !== positionals.length - 1) {
    throw new Error(`Variadic positional in ${command.id} must be last.`);
  }
  for (let index = 1; index < positionals.length; index += 1) {
    if (positionals[index]?.required && !positionals[index - 1]?.required) {
      throw new Error(`Required positionals in ${command.id} must precede optional positionals.`);
    }
  }
}

function assertRemoteMutationConfirmation(command: CommandDefinition): void {
  if (command.safety !== "remote-mutation") {
    return;
  }
  const confirmation = (command.options ?? []).find(
    (option) => option.key === command.confirmation.optionKey
  );
  if (!confirmation) {
    throw new Error(`Remote mutation command ${command.id} must declare its confirmation option.`);
  }
  if (confirmation.kind !== "boolean") {
    throw new Error(`Remote mutation command ${command.id} confirmation must be boolean.`);
  }
}

function assertCompatibleOptionSpellings(registry: CommandRegistry): void {
  const definitions = [
    ...registry.globalOptions,
    ...registry.commands.flatMap((command) => command.options ?? []),
  ];
  const shapes = new Map<string, {kind: OptionDefinition["kind"]; valueName: string | undefined}>();

  for (const definition of definitions) {
    const spellings: string[] = definition.short
      ? [definition.long, definition.short]
      : [definition.long];
    for (const spelling of spellings) {
      const existing = shapes.get(spelling);
      if (
        existing &&
        (existing.kind !== definition.kind || existing.valueName !== definition.valueName)
      ) {
        throw new Error(`Option ${spelling} has incompatible definitions.`);
      }
      shapes.set(spelling, {kind: definition.kind, valueName: definition.valueName});
    }
  }
}

function assertGlobalOptionsDoNotOverlap(registry: CommandRegistry): void {
  const globalKeys = new Set(registry.globalOptions.map((option) => option.key));
  const globalSpellings = new Set(
    registry.globalOptions.flatMap((option) =>
      option.short ? [option.long, option.short] : [option.long]
    )
  );
  for (const command of registry.commands) {
    for (const option of command.options ?? []) {
      if (globalKeys.has(option.key)) {
        throw new Error(`Command ${command.id} redefines global option key ${option.key}.`);
      }
      if (globalSpellings.has(option.long) || (option.short && globalSpellings.has(option.short))) {
        throw new Error(`Command ${command.id} redefines a global option.`);
      }
    }
  }
}

function assertNestedCommandsHaveGroups(registry: CommandRegistry): void {
  const groupPaths = new Set<string>();
  for (const group of registry.groups) {
    for (const path of [group.path, ...(group.aliases ?? [])]) {
      groupPaths.add(pathKey(path));
    }
  }

  for (const definition of [...registry.groups, ...registry.commands]) {
    for (const path of [definition.path, ...(definition.aliases ?? [])]) {
      if (path.length > 1 && !groupPaths.has(pathKey(path.slice(0, -1)))) {
        throw new Error(`${definition.id} has no registered parent command group.`);
      }
    }
  }
}

function registerPaths(
  id: string,
  paths: readonly (readonly string[])[],
  registered: Set<string>
): void {
  for (const path of paths) {
    if (path.some((part) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part))) {
      throw new Error(`${id} contains an invalid command path.`);
    }
    const key = pathKey(path);
    if (registered.has(key)) {
      throw new Error(`Duplicate command path: ${path.join(" ") || "<default>"}.`);
    }
    registered.add(key);
  }
}

function pathKey(path: readonly string[]): string {
  return path.join("\u0000");
}

function registerDefinitionId(id: string, registered: Set<string>): void {
  if (registered.has(id)) {
    throw new Error(`Duplicate command definition id: ${id}.`);
  }
  registered.add(id);
}

function assertDefinitionId(id: string, kind: string): void {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)) {
    throw new Error(`Invalid ${kind} id: ${id}.`);
  }
}

function assertSafeMetadataText(value: string, label: string, maxLength = 500): void {
  if (!value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    throw new Error(`${label} must be non-empty, bounded, printable text.`);
  }
}
