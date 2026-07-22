import {expect, test} from "bun:test";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createCommandRegistry} from "@/package/commands/command-registry";
import type {CommandDefinition, CommandRegistry} from "@/package/commands/command";
import {getCommandSafetyViolation} from "@/package/commands/command-safety";
import {formatHelp} from "@/package/commands/help";
import {assertValidCommandRegistry} from "@/package/commands/registry-validation";
import {createCliRuntime} from "@/package/commands/runtime";

const registry = createCommandRegistry(createCliRuntime());

test("every command has generated usage, help-visible options, and a safety category", () => {
  for (const command of registry.commands) {
    const help = formatHelp(registry, command.path.length === 0 ? null : command);

    expect(command.description.length).toBeGreaterThan(0);
    expect(command.usage.length).toBeGreaterThan(0);
    expect(command.safetyNote.length).toBeGreaterThan(0);
    expect(["read-only", "local-write", "remote-mutation"]).toContain(command.safety);
    for (const option of command.options ?? []) {
      expect(help, `${command.id} help`).toContain(option.long);
      expect(option.description.length).toBeGreaterThan(0);
    }
  }
});

test("registry formally separates read-only and local-write commands", () => {
  const safetyById = Object.fromEntries(
    registry.commands.map((command) => [command.id, command.safety])
  );

  expect(safetyById).toEqual({
    dashboard: "read-only",
    status: "read-only",
    coupons: "read-only",
    "agents.install": "local-write",
    init: "local-write",
  });
});

test("registry validation rejects ambiguous paths and unsafe remote mutations", () => {
  const dashboard = registry.commands.find((command) => command.id === "dashboard")!;
  const unsafeDefault: CommandDefinition = {...dashboard, safety: "local-write"};
  expect(() =>
    assertValidCommandRegistry({
      ...registry,
      commands: registry.commands.map((command) =>
        command.id === dashboard.id ? unsafeDefault : command
      ),
    })
  ).toThrow("default command must be read-only");

  const duplicatePath: CommandDefinition = {
    ...registry.commands.find((command) => command.id === "status")!,
    id: "other-status",
  };
  expect(() =>
    assertValidCommandRegistry({
      ...registry,
      commands: [...registry.commands, duplicatePath],
    })
  ).toThrow("Duplicate command path");

  const unsafeMutation: CommandDefinition = {
    id: "redeem",
    path: ["redeem"],
    description: "Redeem a coupon",
    usage: ["codex-limits redeem"],
    safety: "remote-mutation",
    safetyNote: "Changes the remote account.",
    failureMessage: "Could not redeem coupon.",
    confirmation: {optionKey: "confirm"},
    async execute() {
      return 0;
    },
  };
  const unsafeRegistry: CommandRegistry = {
    ...registry,
    commands: [...registry.commands, unsafeMutation],
  };

  expect(() => assertValidCommandRegistry(unsafeRegistry)).toThrow(
    "must declare its confirmation option"
  );
});

test("registry validation rejects unsafe or drifting contributor metadata", () => {
  const status = registry.commands.find((command) => command.id === "status")!;
  for (const unsafeDescription of ["Unsafe\u001b[31m", "Unsafe\u009b31m"]) {
    expect(() =>
      assertValidCommandRegistry({
        ...registry,
        commands: registry.commands.map((command) =>
          command.id === status.id ? {...status, description: unsafeDescription} : command
        ),
      })
    ).toThrow("bounded, printable text");
  }

  expect(() =>
    assertValidCommandRegistry({
      ...registry,
      commands: registry.commands.map((command) =>
        command.id === status.id ? {...status, usage: ["another-cli status"]} : command
      ),
    })
  ).toThrow("invalid or duplicate usage");

  expect(() =>
    assertValidCommandRegistry({
      ...registry,
      globalOptions: registry.globalOptions.map((option) =>
        option.action === "help" ? {...option, exclusive: false} : option
      ),
    })
  ).toThrow("must be exclusive");

  expect(() =>
    assertValidCommandRegistry({
      ...registry,
      commands: registry.commands.map((command) =>
        command.id === status.id
          ? {
              ...status,
              options: [
                {
                  key: "global.help",
                  long: "--other",
                  description: "Other option",
                  kind: "boolean",
                },
              ],
            }
          : command
      ),
    })
  ).toThrow("redefines global option key");

  expect(() =>
    createCommandRegistry(
      createCliRuntime({
        agents: {
          integrations: [
            {
              id: "unsafe",
              name: "unsafe\u009b31m",
              description: "Unsafe integration metadata.",
              async install() {
                return {changed: false};
              },
            },
          ],
        },
      })
    )
  ).toThrow("invalid display metadata");
});

test("remote mutations cannot execute without their declared confirmation", () => {
  const mutation: CommandDefinition = {
    id: "redeem",
    path: ["redeem"],
    description: "Redeem a coupon",
    usage: ["codex-limits redeem --confirm"],
    options: [
      {
        key: "confirm",
        long: "--confirm",
        description: "Confirm redemption",
        kind: "boolean",
      },
    ],
    safety: "remote-mutation",
    safetyNote: "Changes the remote account.",
    failureMessage: "Could not redeem coupon.",
    confirmation: {optionKey: "confirm"},
    async execute() {
      return 0;
    },
  };

  expect(getCommandSafetyViolation(mutation, {options: {}, positionals: []})).toContain(
    "explicit confirmation with --confirm"
  );
  expect(
    getCommandSafetyViolation(mutation, {options: {confirm: true}, positionals: []})
  ).toBeNull();
});

test("root and nested help are generated from registry metadata", () => {
  const rootHelp = formatHelp(registry);
  const agents = registry.groups.find((group) => group.id === "agents")!;
  const install = registry.commands.find((command) => command.id === "agents.install")!;
  const agentsHelp = formatHelp(registry, agents);
  const installHelp = formatHelp(registry, install);

  expect(rootHelp).toContain("status   Print a non-interactive usage summary");
  expect(rootHelp).toContain("agents   Manage optional coding-agent integrations");
  expect(rootHelp.indexOf("agents   Manage")).toBeLessThan(rootHelp.indexOf("init     Install"));
  expect(rootHelp).toContain("CODEX_LIMITS_HOME");
  expect(agentsHelp).toContain("install  Install optional agent integrations");
  expect(installHelp).toContain("[<agent...>]");

  const registryWithGlobalOption: CommandRegistry = {
    ...registry,
    globalOptions: [
      ...registry.globalOptions,
      {
        key: "global.verbose",
        long: "--verbose",
        description: "Print verbose output",
        kind: "boolean",
      },
    ],
  };
  expect(formatHelp(registryWithGlobalOption, agents)).toContain("--verbose");
  expect(formatHelp(registryWithGlobalOption, install)).toContain("--verbose");
});

test("README covers every public command path", async () => {
  const readmePath = fileURLToPath(import.meta.resolve("@root/README.md"));
  const readme = await readFile(readmePath, "utf8");

  for (const command of registry.commands) {
    if (command.path.length > 0) {
      expect(readme, command.id).toContain(`codex-limits ${command.path.join(" ")}`);
    }
  }
});
