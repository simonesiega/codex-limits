import {expect, test} from "bun:test";
import {createCommandRegistry} from "@/package/commands/command-registry";
import type {CommandDefinition, CommandRegistry, OptionValue} from "@/package/commands/command";
import {parseCliArguments, type CliParseResult} from "@/package/commands/parser";
import {createCliRuntime} from "@/package/commands/runtime";

const registry = createCommandRegistry(createCliRuntime());

function parse(args: readonly string[]): CliParseResult {
  return parseCliArguments(registry, args);
}

test("parser accepts root, nested, compatibility, and order-independent options", () => {
  const cases: Array<{
    args: string[];
    kind: CliParseResult["kind"];
    commandId?: string;
    options?: Record<string, OptionValue>;
  }> = [
    {args: [], kind: "command", commandId: "dashboard", options: {}},
    {args: ["status"], kind: "command", commandId: "status", options: {}},
    {args: ["coupons"], kind: "command", commandId: "coupons", options: {}},
    {args: ["doctor"], kind: "command", commandId: "doctor", options: {}},
    {
      args: ["doctor", "--json"],
      kind: "command",
      commandId: "doctor",
      options: {"output.json": true},
    },
    {
      args: ["coupons", "--json"],
      kind: "command",
      commandId: "coupons",
      options: {"output.json": true},
    },
    {
      args: ["--json", "coupons"],
      kind: "command",
      commandId: "coupons",
      options: {"output.json": true},
    },
    {
      args: ["--json"],
      kind: "command",
      commandId: "dashboard",
      options: {"output.json": true},
    },
    {
      args: ["agents", "install", "opencode"],
      kind: "command",
      commandId: "agents.install",
      options: {},
    },
    {
      args: ["init", "--opencode"],
      kind: "command",
      commandId: "init",
      options: {"init.agent.opencode": true},
    },
    {args: ["--help"], kind: "help"},
    {args: ["agents"], kind: "help"},
    {args: ["agents", "install", "-h"], kind: "help"},
    {args: ["--version"], kind: "version"},
  ];

  for (const item of cases) {
    const result = parse(item.args);
    expect(result.kind, item.args.join(" ")).toBe(item.kind);
    if (result.kind === "command") {
      expect(result.command.id).toBe(item.commandId ?? "");
      expect(result.values.options).toEqual(item.options ?? {});
    }
  }
});

test("parser rejects malformed combinations with structured sanitized errors", () => {
  const cases = [
    {args: ["--json", "--json"], code: "duplicate-option"},
    {args: ["status", "--json"], code: "unknown-option"},
    {args: ["status", "extra"], code: "unexpected-positional"},
    {args: ["coupons", "--json=true"], code: "invalid-option-value"},
    {args: ["init", "--all", "--opencode"], code: "conflicting-options"},
    {args: ["agents", "install", "unknown"], code: "invalid-positional"},
    {args: ["agents", "unknown"], code: "unknown-command"},
    {args: ["unknown"], code: "unknown-command"},
  ] as const;

  for (const item of cases) {
    const result = parse(item.args);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error.code, item.args.join(" ")).toBe(item.code);
    }
  }

  const invalidCouponOption = parse(["coupons", "--json=true"]);
  expect(invalidCouponOption.kind).toBe("error");
  if (invalidCouponOption.kind === "error") {
    expect(invalidCouponOption.subject?.id).toBe("coupons");
  }

  const duplicateRootOption = parse(["--json", "--json"]);
  expect(duplicateRootOption.kind).toBe("error");
  if (duplicateRootOption.kind === "error") {
    expect(duplicateRootOption.error.message).toBe("Duplicate option: --json");
    expect(duplicateRootOption.subject).toBeNull();
  }

  const secret = parse(["--access-token", "fake-secret-token"]);
  expect(secret.kind).toBe("error");
  if (secret.kind === "error") {
    expect(secret.error.input).toBe("--access-token [redacted]");
    expect(secret.error.message).not.toContain("fake-secret-token");
  }

  const controlledSecret = parse(["--password\u009b31m", "fake-password"]);
  expect(controlledSecret.kind).toBe("error");
  if (controlledSecret.kind === "error") {
    expect(controlledSecret.error.input).toBe("--password?31m [redacted]");
    expect(controlledSecret.error.message).not.toContain("fake-password");
    expect(controlledSecret.error.message).not.toContain("\u009b");
  }

  const oversizedSecretOption = parse([`--access-token-${"x".repeat(100)}`, "fake-secret-token"]);
  expect(oversizedSecretOption.kind).toBe("error");
  if (oversizedSecretOption.kind === "error") {
    expect(oversizedSecretOption.error.input).toBe("[option] [redacted]");
    expect(oversizedSecretOption.error.message).not.toContain("fake-secret-token");
  }

  const path = parse(["C:/Users/private/.codex/auth.json"]);
  expect(path.kind).toBe("error");
  if (path.kind === "error") {
    expect(path.error.input).toBe("[path]");
  }

  const identifier = parse(["00000000-0000-0000-0000-000000000000"]);
  expect(identifier.kind).toBe("error");
  if (identifier.kind === "error") {
    expect(identifier.error.input).toBe("[redacted]");
  }

  const control = parse(["unknown\u001b[31m\u009b32m"]);
  expect(control.kind).toBe("error");
  if (control.kind === "error") {
    expect(control.error.input).toBe("unknown?[31m?32m");
  }
});

test("parser supports required values, repeatable options, aliases, conflicts, and --", () => {
  const configurable: CommandDefinition = {
    id: "config.set",
    path: ["config", "set"],
    aliases: [["cfg", "set"]],
    description: "Set a test value",
    usage: ["codex-limits config set <name> --file <path>"],
    options: [
      {
        key: "file",
        long: "--file",
        short: "-f",
        description: "Input file",
        kind: "value",
        valueName: "path",
      },
      {
        key: "tag",
        long: "--tag",
        description: "Tag",
        kind: "value",
        valueName: "name",
        repeatable: true,
      },
      {
        key: "force",
        long: "--force",
        description: "Force",
        kind: "boolean",
        conflicts: ["safe"],
      },
      {
        key: "safe",
        long: "--safe",
        description: "Safe",
        kind: "boolean",
        conflicts: ["force"],
      },
    ],
    positionals: [{name: "name", description: "Setting name", required: true}],
    safety: "local-write",
    safetyNote: "Test only.",
    failureMessage: "Test failed.",
    async execute() {
      return 0;
    },
  };
  const customRegistry: CommandRegistry = {
    ...registry,
    groups: [
      ...registry.groups,
      {id: "config", path: ["config"], aliases: [["cfg"]], description: "Configure values"},
    ],
    commands: [...registry.commands, configurable],
  };

  const parsed = parseCliArguments(customRegistry, [
    "--file",
    "settings.json",
    "cfg",
    "set",
    "theme",
    "--tag=one",
    "--tag",
    "two",
  ]);
  expect(parsed.kind).toBe("command");
  if (parsed.kind === "command") {
    expect(parsed.command.id).toBe("config.set");
    expect(parsed.values.positionals).toEqual(["theme"]);
    expect(parsed.values.options).toEqual({
      file: "settings.json",
      tag: ["one", "two"],
    });
  }

  const missingValue = parseCliArguments(customRegistry, ["config", "set", "name", "--file"]);
  expect(missingValue.kind).toBe("error");
  if (missingValue.kind === "error") {
    expect(missingValue.error.code).toBe("missing-option-value");
    expect(missingValue.subject?.id).toBe("config.set");
  }

  const conflict = parseCliArguments(customRegistry, [
    "config",
    "set",
    "name",
    "--safe",
    "--force",
  ]);
  expect(conflict.kind).toBe("error");
  if (conflict.kind === "error") {
    expect(conflict.error.code).toBe("conflicting-options");
  }

  const positionalOption = parseCliArguments(customRegistry, ["config", "set", "--", "--name"]);
  expect(positionalOption.kind).toBe("command");
  if (positionalOption.kind === "command") {
    expect(positionalOption.values.positionals).toEqual(["--name"]);
  }

  const defaultCommand = registry.commands.find((command) => command.path.length === 0)!;
  const defaultWithPositional: CommandRegistry = {
    ...registry,
    commands: registry.commands.map((command) =>
      command.id === defaultCommand.id
        ? {
            ...defaultCommand,
            usage: ["codex-limits [<file>]"],
            positionals: [{name: "file", description: "Input file"}],
          }
        : command
    ),
  };
  const rootPositional = parseCliArguments(defaultWithPositional, ["report.txt"]);
  expect(rootPositional.kind).toBe("command");
  if (rootPositional.kind === "command") {
    expect(rootPositional.command.id).toBe("dashboard");
    expect(rootPositional.values.positionals).toEqual(["report.txt"]);
  }
});
