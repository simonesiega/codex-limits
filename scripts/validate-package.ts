import {spawn} from "node:child_process";
import {mkdtemp, mkdir, readFile, rm, stat} from "node:fs/promises";
import {builtinModules} from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

interface PackFile {
  path: string;
  mode: number;
}

interface PackResult {
  filename: string;
  files: PackFile[];
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const root = join(import.meta.dir, "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
  name: string;
  version: string;
  bin?: Record<string, string>;
  exports?: Record<string, {import?: string; types?: string}>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  pi?: {extensions?: string[]};
};

assert(packageJson.name === "@simonesiega/codex-limits", "Unexpected npm package name.");
assert(packageJson.bin?.["codex-limits"] === "dist/cli.js", "Unexpected binary target.");
assert(packageJson.exports?.["."]?.import === "./dist/index.js", "Unexpected root import target.");
assert(packageJson.exports?.["."]?.types === "./types/index.d.ts", "Unexpected type target.");
assert(
  Object.keys(packageJson.dependencies ?? {}).length === 0,
  "Runtime dependencies must be bundled."
);
assert(
  packageJson.pi?.extensions?.length === 1 && packageJson.pi.extensions[0] === "./dist/pi.js",
  "Unexpected pi extension manifest."
);

const cliPath = join(root, "dist", "cli.js");
const cli = await readFile(cliPath, "utf8");
assert(cli.startsWith("#!/usr/bin/env node\n"), "CLI bundle is missing its Node shebang.");
if (process.platform !== "win32") {
  assert(((await stat(cliPath)).mode & 0o111) !== 0, "CLI bundle is not executable.");
}

for (const file of ["dist/cli.js", "dist/index.js", "dist/pi.js"]) {
  const content = await readFile(join(root, file), "utf8");
  assert(!content.includes("src/package/"), `${file} contains a source-only path.`);
  assert(!/\bfrom\s*["'][^"']+\.(?:ts|tsx)["']/.test(content), `${file} imports TypeScript.`);

  const specifiers = [
    ...content.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ...content.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);
  for (const specifier of specifiers) {
    if (!specifier || specifier.startsWith(".") || specifier.startsWith("node:")) {
      continue;
    }
    const allowedPeers =
      file === "dist/pi.js" ? Object.keys(packageJson.peerDependencies ?? {}) : [];
    assert(
      builtinModules.includes(specifier) || allowedPeers.includes(specifier),
      `${file} has undeclared runtime import ${specifier}.`
    );
  }
}

if (await hasLocalPiHostDependencies()) {
  await smokePiExtensionBundle();
}

const thirdPartyNotices = await readFile(join(root, "dist", "THIRD_PARTY_NOTICES.txt"), "utf8");
for (const packageName of ["ink@", "react@", "signal-exit@", "yoga-layout@"]) {
  assert(
    thirdPartyNotices.includes(`Package: ${packageName}`),
    `Third-party notices are missing ${packageName}.`
  );
}
assert(
  thirdPartyNotices.includes("Permission is hereby granted"),
  "Third-party notices contain no license text."
);

const temporaryRoot = await mkdtemp(join(tmpdir(), "codex-limits-package-"));
try {
  const packOutput = await run(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", temporaryRoot],
    root
  );
  const [packed] = JSON.parse(packOutput) as PackResult[];
  assert(packed, "npm pack returned no artifact.");

  const paths = new Set(packed.files.map((file) => file.path));
  const packedCli = packed.files.find((file) => file.path === "dist/cli.js");
  if (process.platform !== "win32") {
    assert(Boolean(packedCli && (packedCli.mode & 0o111) !== 0), "Packed CLI is not executable.");
  }

  for (const required of [
    "dist/cli.js",
    "dist/index.js",
    "dist/pi.js",
    "dist/THIRD_PARTY_NOTICES.txt",
    "types/index.d.ts",
    "scripts/postinstall.cjs",
    ".env.example",
    "docs/photos/agents/opencode/opencode_result.png",
    "docs/photos/agents/pi/pi_result.png",
    "docs/photos/logo/logo.png",
    "docs/photos/logo/title-animation.svg",
    "docs/photos/terminal/final_result_large.png",
    "docs/photos/terminal/final_result_small.png",
    "README.md",
    "SECURITY.md",
    "CHANGELOG.md",
    "LICENSE",
    "package.json",
  ]) {
    assert(paths.has(required), `Packed artifact is missing ${required}.`);
  }
  for (const path of paths) {
    assert(
      !path.startsWith("src/") &&
        !path.startsWith("tests/") &&
        !path.startsWith(".github/") &&
        !path.startsWith("agents/") &&
        !path.startsWith(".agents/") &&
        !(path.startsWith("scripts/") && path !== "scripts/postinstall.cjs"),
      `Packed artifact contains development-only file ${path}.`
    );
  }

  const extractDirectory = join(temporaryRoot, "extract");
  await mkdir(extractDirectory);
  await run("tar", ["-xzf", packed.filename, "-C", "extract"], temporaryRoot);

  const packedRoot = join(extractDirectory, "package");
  await smokeCli(packedRoot, packageJson.version);

  const rootModuleUrl = pathToFileURL(join(packedRoot, "dist", "index.js")).href;
  const rootModule = (await import(rootModuleUrl)) as {
    default?: {id?: string; tui?: unknown};
    tui?: unknown;
  };
  const exportNames = Object.keys(rootModule).sort();
  assert(
    exportNames.length === 2 && exportNames[0] === "default" && exportNames[1] === "tui",
    "Packed root module has an unexpected export surface."
  );
  assert(rootModule.default?.id === "codex-limits", "Packed default plugin id is incorrect.");
  assert(
    typeof rootModule.default.tui === "function",
    "Packed default plugin has no tui function."
  );
  assert(
    rootModule.tui === rootModule.default.tui,
    "Named tui export differs from the default plugin."
  );

  const nodeImport = await runResult(
    "node",
    [
      "--input-type=module",
      "--eval",
      'const m=await import(process.argv[1]); if (m.default?.id !== "codex-limits" || typeof m.tui !== "function" || m.tui !== m.default.tui) process.exit(1);',
      rootModuleUrl,
    ],
    packedRoot,
    process.env
  );
  assert(nodeImport.exitCode === 0, "Node could not import the packed root module.");
  assert(nodeImport.stderr === "", "Packed root import unexpectedly wrote to stderr.");
} finally {
  await rm(temporaryRoot, {recursive: true, force: true});
}

async function hasLocalPiHostDependencies(): Promise<boolean> {
  try {
    await Promise.all(
      ["pi-coding-agent", "pi-tui"].map((packageName) =>
        stat(join(root, "node_modules", "@earendil-works", packageName, "package.json"))
      )
    );
    return true;
  } catch {
    return false;
  }
}

async function smokePiExtensionBundle(): Promise<void> {
  let commandName = "";
  let commandHandler:
    | ((args: string, context: {hasUI: boolean; mode: string; ui: object}) => Promise<void>)
    | undefined;
  let sentMessages = 0;
  const moduleUrl = `${pathToFileURL(join(root, "dist", "pi.js")).href}?validate=${Date.now()}`;
  const piModule = (await import(moduleUrl)) as {default?: (api: object) => void};

  assert(typeof piModule.default === "function", "Pi bundle has no default extension export.");
  piModule.default({
    registerCommand: (
      name: string,
      definition: {
        handler: (
          args: string,
          context: {hasUI: boolean; mode: string; ui: object}
        ) => Promise<void>;
      }
    ) => {
      commandName = name;
      commandHandler = definition.handler;
    },
    sendUserMessage: () => {
      sentMessages += 1;
    },
  });

  assert(commandName === "codex-limits", "Pi bundle registered an unexpected command.");
  assert(commandHandler, "Pi bundle did not register a command handler.");
  await commandHandler("", {hasUI: false, mode: "print", ui: {}});
  assert(sentMessages === 0, "Pi bundle sent an unexpected LLM message.");
}

async function smokeCli(packedRoot: string, version: string): Promise<void> {
  const home = join(packedRoot, ".smoke-home");
  await mkdir(home, {recursive: true});

  const env = {...process.env};
  for (const key of Object.keys(env)) {
    if (key.startsWith("CODEX_LIMITS_") || key === "CODEX_HOME") {
      delete env[key];
    }
  }
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    CODEX_LIMITS_HOME: join(home, "missing-codex-home"),
    PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
  });

  const commands: Array<{args: string[]; json?: boolean; includes?: string}> = [
    {args: ["--help"], includes: "codex-limits status"},
    {args: ["--version"], includes: `${version}\n`},
    {args: ["status"], includes: "Usage Limits"},
    {args: ["coupons"], includes: "Reset Coupons"},
    {args: ["doctor"], includes: "Codex Limits diagnostics"},
    {args: ["doctor", "--json"], json: true},
    {args: ["agents", "--help"], includes: "Manage optional coding-agent integrations"},
    {args: ["agents", "install", "--help"], includes: "Install optional agent integrations"},
    {args: ["agents", "install", "pi"], includes: "pi: installed"},
    {
      args: ["doctor", "--json"],
      json: true,
      includes: '"pi": "installed"',
    },
    {args: ["init", "--help"], includes: "compatibility command"},
    {args: ["--json"], json: true},
    {args: ["coupons", "--json"], json: true},
  ];

  for (const command of commands) {
    const result = await runResult(
      "node",
      [join(packedRoot, "dist", "cli.js"), ...command.args],
      packedRoot,
      env
    );
    assert(result.exitCode === 0, `Packed CLI failed for ${command.args.join(" ")}.`);
    assert(result.stderr === "", `Packed CLI wrote stderr for ${command.args.join(" ")}.`);
    if (command.json) {
      JSON.parse(result.stdout);
    }
    if (command.includes) {
      assert(
        result.stdout.includes(command.includes),
        `Packed CLI output mismatch for ${command.args.join(" ")}.`
      );
    }
  }

  const piSettings = JSON.parse(
    await readFile(join(home, ".pi", "agent", "settings.json"), "utf8")
  ) as {packages?: unknown[]};
  assert(
    piSettings.packages?.includes(packedRoot) === true,
    "Packed CLI registered an unexpected pi package path."
  );
}

async function run(command: string, args: string[], cwd: string): Promise<string> {
  const result = await runResult(command, args, cwd, process.env);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim();
    throw new Error(
      detail
        ? `${command} failed during package validation: ${detail}`
        : `${command} failed during package validation.`
    );
  }
  return result.stdout;
}

function runResult(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd, env, stdio: ["ignore", "pipe", "pipe"]});
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (exitCode) =>
      resolve({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      })
    );
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
