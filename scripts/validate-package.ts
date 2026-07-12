import {spawn} from "node:child_process";
import {mkdtemp, mkdir, readFile, rm, stat} from "node:fs/promises";
import {builtinModules} from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

// Store the structure of a packed npm artifact for validation.
interface PackFile {
  path: string;
  mode: number;
}

// Store the structure of an npm pack result for validation.
interface PackResult {
  filename: string;
  files: PackFile[];
}

// Parse the pacage.json
const root = join(import.meta.dir, "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
  name: string;
  version: string;
  bin?: Record<string, string>;
  exports?: Record<string, {import?: string; types?: string}>;
  files?: string[];
  dependencies?: Record<string, string>;
};

// Validate the package.json structure and contents.
assert(packageJson.name === "@simonesiega/codex-limits", "Unexpected npm package name.");
assert(packageJson.bin?.["codex-limits"] === "dist/cli.js", "Unexpected binary target.");
assert(packageJson.exports?.["."]?.import === "./dist/index.js", "Unexpected root import target.");
assert(packageJson.exports?.["."]?.types === "./types/index.d.ts", "Unexpected type target.");
assert(
  Object.keys(packageJson.dependencies ?? {}).length === 0,
  "Runtime dependencies must be bundled."
);

// Validate the built CLI bundle.
const cliPath = join(root, "dist", "cli.js");
const cli = await readFile(cliPath, "utf8");
assert(cli.startsWith("#!/usr/bin/env node\n"), "CLI bundle is missing its Node shebang.");
if (process.platform !== "win32") {
  assert(((await stat(cliPath)).mode & 0o111) !== 0, "CLI bundle is not executable.");
}

// Validate the built artifacts.
for (const file of ["dist/cli.js", "dist/index.js"]) {
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
    assert(
      builtinModules.includes(specifier),
      `${file} has undeclared runtime import ${specifier}.`
    );
  }
}

// Validate the packed npm artifact.
const temporaryRoot = await mkdtemp(join(tmpdir(), "codex-limits-package-"));
try {
  const packOutput = await run(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", temporaryRoot],
    root
  );
  const packResults = JSON.parse(packOutput) as PackResult[];
  const packed = packResults[0];
  assert(Boolean(packed), "npm pack returned no artifact.");

  const paths = new Set(packed!.files.map((file) => file.path));
  const packedCli = packed!.files.find((file) => file.path === "dist/cli.js");
  if (process.platform !== "win32") {
    assert(Boolean(packedCli && (packedCli.mode & 0o111) !== 0), "Packed CLI is not executable.");
  }
  for (const required of [
    "dist/cli.js",
    "dist/index.js",
    "types/index.d.ts",
    "scripts/postinstall.cjs",
    "README.md",
    "SECURITY.md",
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
        !path.startsWith(".agents/"),
      `Packed artifact contains development-only file ${path}.`
    );
  }

  const extractDirectory = join(temporaryRoot, "extract");
  await mkdir(extractDirectory);
  await run("tar", ["-xzf", packed!.filename, "-C", "extract"], temporaryRoot);
  const packedRoot = join(extractDirectory, "package");
  await smokeCli(packedRoot, packageJson.version);

  const rootModuleUrl = pathToFileURL(join(packedRoot, "dist", "index.js")).href;
  const rootModule = (await import(rootModuleUrl)) as {
    default?: {id?: string; tui?: unknown};
    tui?: unknown;
  };
  assert(
    JSON.stringify(Object.keys(rootModule).sort()) === JSON.stringify(["default", "tui"]),
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

/**
 * Runs a series of smoke tests on the packed CLI.
 * @param packedRoot - The root directory of the packed npm artifact.
 * @param version - The expected version of the CLI, used for validation.
 */
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
  });

  const commands: Array<{args: string[]; json?: boolean; includes?: string}> = [
    {args: ["--help"], includes: "codex-limits status"},
    {args: ["--version"], includes: `${version}\n`},
    {args: ["status"], includes: "Usage Limits"},
    {args: ["coupons"], includes: "Reset Coupons"},
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
        `Packed CLI output mismatch for ${command.args}.`
      );
    }
  }
}

/**
 * Run a command and return its stdout if it succeeds, or throw an error if it fails.
 * @param command - The command to run.
 * @param args - The arguments to pass to the command.
 * @param cwd - The working directory to run the command in.
 * @returns - A promise that resolves to the stdout of the command if it succeeds.
 * @throws - An error if the command fails, with the stderr output included in the message.
 */
function run(command: string, args: string[], cwd: string): Promise<string> {
  return runResult(command, args, cwd, process.env).then((result) => {
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim();
      throw new Error(
        detail
          ? `${command} failed during package validation: ${detail}`
          : `${command} failed during package validation.`
      );
    }
    return result.stdout;
  });
}

/**
 * Run a command and return its result if it succeeds, or throw an error if it fails.
 * @param command - The command to run.
 * @param args - The arguments to pass to the command.
 * @param cwd - The working directory to run the command in.
 * @param env - The environment variables to use.
 * @returns - A promise that resolves to the result of the command if it succeeds.
 * @throws - An error if the command fails.
 */
function runResult(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<{exitCode: number; stdout: string; stderr: string}> {
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

/**
 * Assert that a condition is true, or throw an error with the provided message if it is false.
 * @param condition - The condition to assert.
 * @param message - The message to throw if the condition is false.
 * @throws - An error with the provided message if the condition is false.
 */
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
