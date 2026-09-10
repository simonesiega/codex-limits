/**
 * @fileoverview Cross-platform npm consumer smoke checks for packed Codex Limits artifacts.
 */
import {mkdir, writeFile} from "node:fs/promises";
import {delimiter, isAbsolute, join} from "node:path";
import {runCommand, type CommandResult} from "./command";

interface NpmInstallationSmokeOptions {
  tarballPath: string;
  temporaryRoot: string;
  version: string;
}

const OVERRIDDEN_SMOKE_ENV_KEYS = new Set([
  "appdata",
  "ci",
  "copilot_home",
  "home",
  "localappdata",
  "no_color",
  "npm_config_audit",
  "npm_config_cache",
  "npm_config_fund",
  "npm_config_global",
  "npm_config_ignore_scripts",
  "npm_config_location",
  "npm_config_offline",
  "npm_config_prefix",
  "npm_config_update_notifier",
  "pi_coding_agent_dir",
  "userprofile",
]);

/** Exercises local, global, npm exec, npx, CLI, and dashboard package-consumer paths. */
export async function smokeNpmInstallations({
  tarballPath,
  temporaryRoot,
  version,
}: NpmInstallationSmokeOptions): Promise<void> {
  if (process.platform === "win32") {
    assert(isAbsolute(temporaryRoot), "Windows package validation did not use an absolute path.");
    assert(temporaryRoot.includes("\\"), "Windows package validation did not use native paths.");
  }

  const npmCache = join(temporaryRoot, "npm cache with spaces-Δ");
  const localCases = [
    {label: "normal path", directory: join(temporaryRoot, "npm-local-normal")},
    {label: "path with spaces", directory: join(temporaryRoot, "npm local path with spaces")},
    {label: "Unicode path", directory: join(temporaryRoot, "npm-local-Unicode-Δ-日本語")},
  ] as const;

  for (const item of localCases) {
    await mkdir(item.directory, {recursive: true});
    await writeFile(
      join(item.directory, "package.json"),
      `${JSON.stringify({name: "codex-limits-install-smoke", private: true, version: "1.0.0"})}\n`,
      "utf8"
    );
    const home = join(item.directory, "profile with spaces-ü");
    const env = createNpmSmokeEnvironment(home, npmCache);
    const install = await runCommand(
      npmExecutable("npm"),
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        tarballPath,
      ],
      item.directory,
      env
    );
    assert(install.exitCode === 0, `Local npm install failed from a ${item.label}.`);

    const packageRoot = join(item.directory, "node_modules", "@simonesiega", "codex-limits");
    const localCli = join(
      item.directory,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "codex-limits.cmd" : "codex-limits"
    );
    await smokeInstalledCli(packageRoot, item.directory, env, item.label, version);

    const npmExec = await runCommand(
      npmExecutable("npm"),
      ["exec", "--", "codex-limits", "--version"],
      item.directory,
      env
    );
    assertVersionOutput(npmExec, `npm exec from a ${item.label}`, version);

    const localNpx = await runCommand(
      npmExecutable("npx"),
      ["--no-install", "codex-limits", "--version"],
      item.directory,
      env
    );
    assertVersionOutput(localNpx, `local npx from a ${item.label}`, version);

    if (process.platform === "win32") {
      await smokePowerShellCli(localCli, item.directory, env, item.label, version);
    } else {
      const directCli = await runCommand(localCli, ["--version"], item.directory, env);
      assertVersionOutput(directCli, `local npm binary from a ${item.label}`, version);
    }
  }

  const globalPrefix = join(temporaryRoot, "npm global path with spaces-Δ-日本語");
  const globalHome = join(globalPrefix, "profile with spaces-ü");
  const globalEnv = createNpmSmokeEnvironment(globalHome, npmCache);
  const globalInstall = await runCommand(
    npmExecutable("npm"),
    [
      "install",
      "--global",
      "--prefix",
      globalPrefix,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      tarballPath,
    ],
    temporaryRoot,
    globalEnv
  );
  assert(globalInstall.exitCode === 0, "Isolated global npm install failed.");

  const globalBin = join(globalPrefix, ...(process.platform === "win32" ? [] : ["bin"]));
  const globalPackageRoot = join(
    globalPrefix,
    ...(process.platform === "win32" ? [] : ["lib"]),
    "node_modules",
    "@simonesiega",
    "codex-limits"
  );
  const globalCli = join(
    globalBin,
    process.platform === "win32" ? "codex-limits.cmd" : "codex-limits"
  );
  const globalExecutionEnv = withPathEntry(globalEnv, globalBin);
  await smokeInstalledCli(
    globalPackageRoot,
    temporaryRoot,
    globalExecutionEnv,
    "global npm path",
    version
  );
  if (process.platform === "win32") {
    await smokePowerShellCli(
      "codex-limits.cmd",
      temporaryRoot,
      globalExecutionEnv,
      "global npm PATH",
      version
    );
  } else {
    const directGlobalCli = await runCommand(
      "codex-limits",
      ["--version"],
      temporaryRoot,
      globalExecutionEnv
    );
    assertVersionOutput(directGlobalCli, "global npm PATH binary", version);
  }

  const directGlobalCli = await runCommand(globalCli, ["--version"], temporaryRoot, globalEnv);
  assertVersionOutput(directGlobalCli, "global npm binary", version);

  const npxDirectory = join(temporaryRoot, "npx path with spaces-Δ-日本語");
  await mkdir(npxDirectory, {recursive: true});
  const ephemeralNpx = await runCommand(
    npmExecutable("npx"),
    ["--yes", "--package", tarballPath, "codex-limits", "--version"],
    npxDirectory,
    createNpmSmokeEnvironment(
      join(npxDirectory, "profile with spaces-ü"),
      join(npxDirectory, "empty npx cache-Δ")
    )
  );
  assertVersionOutput(ephemeralNpx, "ephemeral npx package execution", version);
}

async function smokeInstalledCli(
  packageRoot: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  label: string,
  version: string
): Promise<void> {
  const cliPath = join(packageRoot, "dist", "cli.js");
  const versionResult = await runCommand("node", [cliPath, "--version"], cwd, env);
  assertVersionOutput(versionResult, `installed CLI from a ${label}`, version);

  const diagnostics = await runCommand("node", [cliPath, "doctor", "--json"], cwd, env);
  assert(diagnostics.exitCode === 0, `Installed CLI diagnostics failed from a ${label}.`);
  assert(diagnostics.stderr === "", `Installed CLI diagnostics wrote stderr from a ${label}.`);
  JSON.parse(diagnostics.stdout);

  const dashboard = await runCommand("node", [cliPath], cwd, env, {timeoutMs: 15_000});
  assert(dashboard.exitCode === 0, `Installed TUI startup failed from a ${label}.`);
  assert(dashboard.stderr === "", `Installed TUI startup wrote stderr from a ${label}.`);
  assert(
    dashboard.stdout.includes("CODEX LIMITS"),
    `Installed TUI startup produced unexpected output from a ${label}.`
  );
}

async function smokePowerShellCli(
  cliPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  label: string,
  version: string
): Promise<void> {
  const powershell = ["pwsh", "powershell"]
    .map((candidate) => Bun.which(candidate))
    .find((candidate): candidate is string => Boolean(candidate));
  assert(powershell, "PowerShell is required for native Windows package validation.");

  const result = await runCommand(
    powershell,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      [
        '$ErrorActionPreference = "Stop"',
        "Set-Location -LiteralPath $env:CODEX_LIMITS_SMOKE_CWD",
        "$versionOutput = & $env:CODEX_LIMITS_SMOKE_CLI --version",
        "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
        'if (($versionOutput -join "`n").Trim() -ne $env:CODEX_LIMITS_SMOKE_VERSION) { throw "Version output mismatch." }',
        "$doctorOutput = & $env:CODEX_LIMITS_SMOKE_CLI doctor --json",
        "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
        '$null = ($doctorOutput -join "`n") | ConvertFrom-Json',
        "$completionOutput = & $env:CODEX_LIMITS_SMOKE_CLI completions powershell",
        "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
        "$tokens = $null",
        "$parseErrors = $null",
        '[System.Management.Automation.Language.Parser]::ParseInput(($completionOutput -join "`n"), [ref]$tokens, [ref]$parseErrors) > $null',
        "if ($parseErrors.Count -gt 0) { $parseErrors | ForEach-Object { [Console]::Error.WriteLine($_.ToString()) }; exit 1 }",
      ].join("; "),
    ],
    cwd,
    {
      ...env,
      CODEX_LIMITS_SMOKE_CLI: cliPath,
      CODEX_LIMITS_SMOKE_CWD: cwd,
      CODEX_LIMITS_SMOKE_VERSION: version,
    }
  );
  assert(result.exitCode === 0, `PowerShell CLI execution failed from a ${label}.`);
  assert(result.stderr === "", `PowerShell CLI execution wrote stderr from a ${label}.`);
}

function createNpmSmokeEnvironment(home: string, cache: string): NodeJS.ProcessEnv {
  const env = {...process.env};
  for (const key of Object.keys(env)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.startsWith("codex_limits_") ||
      normalizedKey === "codex_home" ||
      OVERRIDDEN_SMOKE_ENV_KEYS.has(normalizedKey)
    ) {
      delete env[key];
    }
  }

  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    CODEX_LIMITS_HOME: join(home, "Codex data with spaces-Δ"),
    PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
    COPILOT_HOME: join(home, ".copilot"),
    CODEX_LIMITS_SKIP_INIT: "true",
    CI: "true",
    NO_COLOR: "1",
    npm_config_audit: "false",
    npm_config_cache: cache,
    npm_config_fund: "false",
    npm_config_ignore_scripts: "true",
    npm_config_offline: "true",
    npm_config_update_notifier: "false",
  };
}

function withPathEntry(env: NodeJS.ProcessEnv, entry: string): NodeJS.ProcessEnv {
  const updated = {...env};
  for (const key of Object.keys(updated)) {
    if (key.toLowerCase() === "path") {
      delete updated[key];
    }
  }
  updated.PATH = `${entry}${delimiter}${process.env.PATH ?? ""}`;
  return updated;
}

function npmExecutable(command: "npm" | "npx"): string {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function assertVersionOutput(result: CommandResult, label: string, version: string): void {
  assert(result.exitCode === 0, `${label} failed.`);
  assert(result.stdout.trim() === version, `${label} returned an unexpected version.`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
