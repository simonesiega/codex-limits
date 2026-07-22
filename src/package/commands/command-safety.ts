import type {CommandDefinition, ParsedCommandValues} from "@/package/commands/command";

/** Returns a safety violation when a remote mutation lacks explicit confirmation. */
export function getCommandSafetyViolation(
  command: CommandDefinition,
  values: ParsedCommandValues
): string | null {
  if (
    command.safety !== "remote-mutation" ||
    values.options[command.confirmation.optionKey] === true
  ) {
    return null;
  }
  const commandName = command.path.join(" ") || command.id;
  const confirmationOption = command.options?.find(
    (option) => option.key === command.confirmation.optionKey
  );
  return `Command ${commandName} requires explicit confirmation with ${confirmationOption?.long ?? "its confirmation option"}.`;
}
