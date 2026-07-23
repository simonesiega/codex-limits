import type {CommandDefinition, ParsedCommandValues} from "@/package/commands/command";

/** Returns a safety violation when a remote mutation cannot perform its declared confirmation. */
export function getCommandSafetyViolation(
  command: CommandDefinition,
  values: ParsedCommandValues,
  interactiveTerminal = false
): string | null {
  if (command.safety !== "remote-mutation") {
    return null;
  }

  const commandName = command.path.join(" ") || command.id;
  if (command.confirmation.kind === "interactive") {
    return interactiveTerminal
      ? null
      : `Command ${commandName} requires an interactive terminal for confirmation.`;
  }
  const optionKey = command.confirmation.optionKey;
  if (values.options[optionKey] === true) {
    return null;
  }

  const confirmationOption = command.options?.find((option) => option.key === optionKey);
  return `Command ${commandName} requires explicit confirmation with ${confirmationOption?.long ?? "its confirmation option"}.`;
}
