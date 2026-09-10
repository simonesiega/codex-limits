/**
 * @fileoverview Behavioral coverage for completions. The cases document the supported contract and isolate filesystem, network, or host state where applicable.
 */
import {expect, test} from "bun:test";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";
import type {AgentIntegration} from "@/agents";
import {createCommandRegistry} from "@/package/commands/command-registry";
import type {CommandDefinition, CommandRegistry} from "@/package/commands/command";
import {
  COMPLETION_SHELLS,
  type CompletionShell,
  formatShellCompletions,
} from "@/package/commands/completions/format";
import {assertValidCommandRegistry} from "@/package/commands/registry-validation";
import {runCli} from "@/package/commands/run-cli";
import {createCliRuntime} from "@/package/commands/runtime";
import {withTempDirectory} from "@tests/helpers/temp-directory";

const registry = createCommandRegistry(createCliRuntime());
const HOSTILE_DESCRIPTION =
  "Awkward 'single' \"double\" $dollar `tick` (parentheses) \\slash # hash Unicode Δ and spaces";

test("completions command generates a native script for every supported shell", async () => {
  const cases = [
    {shell: "bash", marker: "complete -F _codex_limits_completion codex-limits"},
    {shell: "zsh", marker: "#compdef codex-limits"},
    {shell: "fish", marker: "complete -c codex-limits"},
    {
      shell: "powershell",
      marker: "Register-ArgumentCompleter -Native -CommandName codex-limits",
    },
    {shell: "nushell", marker: 'export extern "codex-limits"'},
  ] as const;

  for (const item of cases) {
    const output: string[] = [];
    const errors: string[] = [];
    const exitCode = await runCli(["completions", item.shell], {
      io: {
        stdout: (text) => output.push(text),
        stderr: (text) => errors.push(text),
      },
    });
    const script = output.join("");

    expect(exitCode, item.shell).toBe(0);
    expect(errors, item.shell).toEqual([]);
    expect(script, item.shell).toContain(item.marker);
    expect(script, item.shell).toContain("agents");
    expect(script, item.shell).toContain("install");
    expect(script, item.shell).toContain("--all");
    expect(script, item.shell).toContain("opencode");
    expect(script.endsWith("\n"), item.shell).toBeTrue();
  }
});

test("completions shell names come from positional registry choices", () => {
  const command = registry.commands.find((candidate) => candidate.id === "completions");

  expect(command?.positionals).toEqual([
    {
      name: "shell",
      description: `Shell name (${COMPLETION_SHELLS.join(", ")})`,
      required: true,
      choices: COMPLETION_SHELLS,
    },
  ]);

  for (const shell of COMPLETION_SHELLS) {
    const script = formatShellCompletions(registry, shell);
    for (const candidate of COMPLETION_SHELLS) {
      expect(script, `${shell}: ${candidate}`).toContain(candidate);
    }
  }
});

test("completion execution uses the registry created for the current invocation", async () => {
  const integration: AgentIntegration = {
    id: "registry-only-agent",
    displayName: "Registry-only agent",
    description: "Only present in this invocation.",
    async install() {
      return {changed: false};
    },
    async uninstall() {
      return {changed: false};
    },
    async inspect() {
      return "not-installed";
    },
  };
  const output: string[] = [];

  const exitCode = await runCli(["completions", "fish"], {
    io: {stdout: (text) => output.push(text)},
    agents: {integrations: [integration]},
  });

  expect(exitCode).toBe(0);
  expect(output.join("")).toContain("registry-only-agent");
});

test("Nushell output declares nested externs and typed choice completers", () => {
  const script = formatShellCompletions(registry, "nushell");

  expect(script).toContain('export extern "codex-limits agents install" [');
  expect(script).toContain('def "nu-complete codex-limits completions shell" [] {');
  expect(script).toContain(
    'shell: string@"nu-complete codex-limits completions shell" # Shell name'
  );
  expect(script).toContain('{ value: "nushell", description: "Shell name');
  expect(script).toContain("--help(-h) # Print help for the selected command");
  expect(script).toContain("coupon_index?: string # Displayed reset-coupon number to consume");
});

test("completion candidates are derived from awkward but valid registry metadata", () => {
  const extendedRegistry = createAwkwardRegistry();

  assertValidCommandRegistry(extendedRegistry);
  for (const shell of COMPLETION_SHELLS) {
    const script = formatShellCompletions(extendedRegistry, shell);
    for (const candidate of ["report", "--detailed", "value with spaces", "Unicode-Δ"]) {
      expect(script, `${shell}: ${candidate}`).toContain(candidate);
    }
  }
});

test("generated scripts pass every available native shell parser", async () => {
  const requiredShells = new Set(
    (process.env.CODEX_LIMITS_REQUIRED_COMPLETION_SHELLS ?? "")
      .split(",")
      .map((shell) => shell.trim())
      .filter(Boolean)
  );
  const syntaxChecks: Array<{
    shell: CompletionShell;
    extension: string;
    executables: readonly string[];
    args: (path: string) => string[];
  }> = [
    {
      shell: "bash",
      extension: "bash",
      executables: ["bash"],
      args: (path) => ["--noprofile", "--norc", "-n", path],
    },
    {
      shell: "zsh",
      extension: "zsh",
      executables: ["zsh"],
      args: (path) => ["-f", "-n", path],
    },
    {
      shell: "fish",
      extension: "fish",
      executables: ["fish"],
      args: (path) => ["--no-execute", path],
    },
    {
      shell: "powershell",
      extension: "ps1",
      executables: ["pwsh", "powershell"],
      args: (path) => [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        [
          "$tokens = $null",
          "$parseErrors = $null",
          `[System.Management.Automation.Language.Parser]::ParseFile('${path.replaceAll("'", "''")}', [ref]$tokens, [ref]$parseErrors) > $null`,
          "if ($parseErrors.Count -gt 0) {",
          "  $parseErrors | ForEach-Object { [Console]::Error.WriteLine($_.ToString()) }",
          "  exit 1",
          "}",
        ].join("; "),
      ],
    },
    {
      shell: "nushell",
      extension: "nu",
      executables: ["nu"],
      args: (path) => ["-n", path],
    },
  ];

  await withTempDirectory("codex-limits-completion-syntax-", async (directory) => {
    for (const check of syntaxChecks) {
      const executable = check.executables
        .map((candidate) => Bun.which(candidate))
        .find((candidate): candidate is string => Boolean(candidate));
      if (!executable) {
        const isRequired =
          process.env.CODEX_LIMITS_REQUIRE_COMPLETION_SHELLS === "true" ||
          requiredShells.has(check.shell);
        expect(isRequired, `${check.shell} parser is required`).toBe(false);
        continue;
      }

      const path = join(directory, `codex-limits.${check.extension}`);
      await writeFile(path, formatShellCompletions(createAwkwardRegistry(), check.shell), "utf8");
      const proc = Bun.spawn([executable, ...check.args(path)], {
        stderr: "pipe",
        stdout: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      expect(exitCode, `${check.shell}: ${stderr || stdout}`).toBe(0);
    }
  });
});

function createAwkwardRegistry(): CommandRegistry {
  const status = registry.commands.find((command) => command.id === "status")!;
  const report: CommandDefinition = {
    ...status,
    id: "report",
    path: ["report"],
    description: HOSTILE_DESCRIPTION,
    usage: ["codex-limits report [<format>] [--detailed]"],
    options: [
      {
        key: "report.detailed",
        long: "--detailed",
        description: HOSTILE_DESCRIPTION,
        kind: "boolean",
      },
    ],
    positionals: [
      {
        name: "format",
        description: HOSTILE_DESCRIPTION,
        choices: [
          "value with spaces",
          "single'quote",
          'double"quote',
          "$dollar",
          "`backticks`",
          "Unicode-Δ",
        ],
      },
    ],
  };
  return {...registry, commands: [...registry.commands, report]};
}
