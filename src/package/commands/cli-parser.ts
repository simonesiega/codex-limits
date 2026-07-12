import {CLI_COMMANDS, CLI_FLAGS} from "./cli-spec";
import {sanitizeArguments} from "./safe-error";

/**
 * Store the parsed command from the root CLI arguments
 * including its kind and any associated arguments or flags.
 */
export type ParsedCommand =
  | {kind: "coupons"; json: boolean}
  | {kind: "dashboard"}
  | {kind: "help"}
  | {kind: "init"; args: string[]}
  | {kind: "invalid"; input: string}
  | {kind: "limits-json"}
  | {kind: "status"}
  | {kind: "version"};

/**
 * Parse the root CLI arguments into a structured command object.
 * @param args - The root CLI arguments to parse.
 * @returns - The parsed command object representing the CLI command and its associated arguments or flags.
 * @throws - An error if the CLI arguments are invalid or cannot be parsed.
 */
export function parseCommand(args: readonly string[]): ParsedCommand {
  // Default to the dashboard command if no arguments are provided.
  if (args.length === 0) {
    return {kind: "dashboard"};
  }

  // Handle the init command with any additional arguments.
  if (args[0] === CLI_COMMANDS.init.name) {
    return {kind: "init", args: args.slice(1)};
  }

  // Handle single-argument commands and flags.
  if (args.length === 1) {
    switch (args[0]) {
      case CLI_COMMANDS.status.name:
        return {kind: "status"};
      case CLI_COMMANDS.coupons.name:
        return {kind: "coupons", json: false};
      case CLI_FLAGS.json.long:
        return {kind: "limits-json"};
      case CLI_FLAGS.help.long:
      case CLI_FLAGS.help.short:
        return {kind: "help"};
      case CLI_FLAGS.version.long:
      case CLI_FLAGS.version.short:
        return {kind: "version"};
    }
  }

  // Handle the coupons command with the --json flag.
  if (
    args.length === 2 &&
    args[0] === CLI_COMMANDS.coupons.name &&
    args[1] === CLI_FLAGS.json.long
  ) {
    return {kind: "coupons", json: true};
  }

  return {kind: "invalid", input: sanitizeArguments(args)};
}
