/**
 * @fileoverview Top-level real-host compatibility dispatcher. Host-specific behavior remains in agent-compatibility modules while this file validates options and coordinates isolated execution.
 */
import {mkdtemp, mkdir, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {probeCopilot} from "./agent-compatibility/copilot-host";
import {
  assert,
  CompatibilityHarness,
  executablePath,
  npmCommand,
} from "./agent-compatibility/harness";
import {probeOpencode} from "./agent-compatibility/opencode-host";
import {probePi} from "./agent-compatibility/pi-host";

interface CompatibilityOptions {
  agent: "opencode" | "pi" | "copilot";
  hostRoot: string;
  packageTarball: string;
}

const root = resolve(import.meta.dir, "..");
const options = parseOptions(process.argv.slice(2));
const temporaryRoot = await mkdtemp(join(tmpdir(), `codex-limits-${options.agent}-compat-`));
const harness = new CompatibilityHarness(temporaryRoot);

try {
  const packageRoot = join(temporaryRoot, "package");
  const home = join(temporaryRoot, "home");
  const workspace = join(temporaryRoot, "workspace");
  await Promise.all([
    mkdir(packageRoot),
    mkdir(join(home, "tmp"), {recursive: true}),
    mkdir(workspace),
  ]);

  await harness.run(
    npmCommand(),
    [
      "install",
      "--prefix",
      packageRoot,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      options.packageTarball,
    ],
    root,
    cleanEnvironment(home, workspace)
  );

  const packageJson = JSON.parse(
    await readFile(
      join(packageRoot, "node_modules", "@simonesiega", "codex-limits", "package.json"),
      "utf8"
    )
  ) as {version?: unknown};
  assert(typeof packageJson.version === "string", "Packed Codex Limits version is unavailable.");

  const environment = cleanEnvironment(home, workspace);
  const cli = executablePath(packageRoot, "codex-limits");
  const install = await harness.runResult(
    cli,
    ["agents", "install", options.agent],
    workspace,
    environment
  );
  assert(
    !install.timedOut &&
      install.exitCode === 0 &&
      install.stdout.includes(`${options.agent}: installed`),
    `The packed CLI could not install the ${options.agent} integration: ${harness.commandFailureDetail(install)}`
  );
  assert(install.stderr === "", `The ${options.agent} installer wrote to standard error.`);

  if (options.agent === "pi") {
    await probePi({
      harness,
      hostRoot: options.hostRoot,
      workspace,
      environment,
      expectInstalled: true,
    });
  } else if (options.agent === "opencode") {
    await probeOpencode({
      harness,
      hostRoot: options.hostRoot,
      packageTarball: options.packageTarball,
      packageVersion: packageJson.version,
      home,
      workspace,
      environment,
    });
  } else {
    await probeCopilot({
      harness,
      hostRoot: options.hostRoot,
      workspace,
      environment,
    });
  }

  await verifyUninstall(harness, cli, options.agent, workspace, environment);
  if (options.agent === "pi") {
    await probePi({
      harness,
      hostRoot: options.hostRoot,
      workspace,
      environment,
      expectInstalled: false,
    });
  }

  const hostPackage =
    options.agent === "opencode"
      ? "opencode-ai"
      : options.agent === "pi"
        ? "@earendil-works/pi-coding-agent"
        : "@github/copilot";
  const host = JSON.parse(
    await readFile(
      join(options.hostRoot, "node_modules", ...hostPackage.split("/"), "package.json"),
      "utf8"
    )
  ) as {version?: unknown};
  assert(typeof host.version === "string", "Installed host version is unavailable.");
  console.log(
    `${options.agent} ${host.version}: packed codex-limits ${packageJson.version} completed install, load, /codex-limits dispatch, and uninstall.`
  );
} finally {
  await rm(temporaryRoot, {recursive: true, force: true});
}

function parseOptions(args: string[]): CompatibilityOptions {
  const supported = new Set(["--agent", "--host-root", "--package-tarball"]);
  const values = new Map<string, string>();
  assert(
    args.length === supported.size * 2,
    "Expected exactly --agent, --host-root, and --package-tarball with values."
  );

  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    assert(name && supported.has(name), `Unknown compatibility option: ${name ?? "<missing>"}.`);
    assert(!values.has(name), `Compatibility option ${name} cannot be repeated.`);
    assert(value && !value.startsWith("--"), `Compatibility option ${name} requires a value.`);
    values.set(name, value);
  }

  const agent = values.get("--agent");
  const hostRoot = values.get("--host-root");
  const packageTarball = values.get("--package-tarball");
  assert(
    agent === "opencode" || agent === "pi" || agent === "copilot",
    "Compatibility agent must be opencode, pi, or copilot."
  );
  assert(hostRoot && packageTarball, "Compatibility host root and package tarball are required.");
  assert(
    agent === "pi" || process.platform === "linux",
    "Interactive real-host compatibility probes require Linux."
  );

  return {
    agent,
    hostRoot: resolve(hostRoot),
    packageTarball: resolve(packageTarball),
  };
}

function cleanEnvironment(home: string, workspace: string): NodeJS.ProcessEnv {
  const allowedVariables = new Set([
    "COLORTERM",
    "COMSPEC",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "NODE_EXTRA_CA_CERTS",
    "OS",
    "PATH",
    "PATHEXT",
    "SHELL",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TERM_PROGRAM",
    "TERM_PROGRAM_VERSION",
    "TZ",
    "WINDIR",
  ]);
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allowedVariables.has(key.toUpperCase())) {
      environment[key] = value;
    }
  }

  return {
    ...environment,
    APPDATA: join(home, "AppData", "Roaming"),
    CI: "1",
    CODEX_LIMITS_HOME: join(home, "missing-codex-home"),
    COLUMNS: "100",
    COPILOT_HOME: join(home, ".copilot"),
    HOME: home,
    LINES: "32",
    LOCALAPPDATA: join(home, "AppData", "Local"),
    NO_COLOR: "1",
    PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
    PI_OFFLINE: "1",
    TEMP: join(home, "tmp"),
    TERM: "xterm-256color",
    TMP: join(home, "tmp"),
    TMPDIR: join(home, "tmp"),
    TMUX_TMPDIR: join(home, "tmp"),
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    PWD: workspace,
  };
}

async function verifyUninstall(
  harness: CompatibilityHarness,
  cli: string,
  agent: CompatibilityOptions["agent"],
  workspace: string,
  environment: NodeJS.ProcessEnv
): Promise<void> {
  const uninstall = await harness.runResult(
    cli,
    ["agents", "uninstall", agent],
    workspace,
    environment
  );
  assert(
    !uninstall.timedOut && uninstall.exitCode === 0,
    `The packed CLI could not uninstall the ${agent} integration: ${harness.commandFailureDetail(uninstall)}`
  );
  assert(
    uninstall.stdout.includes(`${agent}: uninstalled`),
    `The packed CLI did not report the ${agent} integration as uninstalled.`
  );
  assert(uninstall.stderr === "", `The ${agent} uninstaller wrote to standard error.`);

  const doctor = await harness.runResult(cli, ["doctor", "--json"], workspace, environment);
  assert(
    !doctor.timedOut && doctor.exitCode === 0 && doctor.stderr === "",
    `Packed diagnostics failed after uninstall: ${harness.commandFailureDetail(doctor)}`
  );
  let diagnostics: {agentIntegrations?: Record<string, unknown>};
  try {
    diagnostics = JSON.parse(doctor.stdout) as {agentIntegrations?: Record<string, unknown>};
  } catch {
    throw new Error("Packed diagnostics returned malformed JSON after uninstall.");
  }
  assert(
    diagnostics.agentIntegrations?.[agent] === "not-installed",
    `Packed diagnostics still recognized the ${agent} integration after uninstall.`
  );
}
