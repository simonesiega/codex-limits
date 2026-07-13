import {CLI_COMMANDS, CLI_FLAGS} from "@/package/commands/cli-spec";
import {sanitizeArguments} from "@/package/commands/safe-error";

export type ParsedCommand =
  | {kind: "coupons"; json: boolean}
  | {kind: "dashboard"}
  | {kind: "help"}
  | {kind: "init"; args: string[]}
  | {kind: "invalid"; input: string}
  | {kind: "limits-json"}
  | {kind: "status"}
  | {kind: "version"};

/** Parses the complete root CLI grammar into a command. */
export function parseCommand(args: readonly string[]): ParsedCommand {
  if (args.length === 0) {
    return {kind: "dashboard"};
  }

  if (args[0] === CLI_COMMANDS.init.name) {
    return {kind: "init", args: args.slice(1)};
  }

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

  if (
    args.length === 2 &&
    args[0] === CLI_COMMANDS.coupons.name &&
    args[1] === CLI_FLAGS.json.long
  ) {
    return {kind: "coupons", json: true};
  }

  return {kind: "invalid", input: sanitizeArguments(args)};
}
