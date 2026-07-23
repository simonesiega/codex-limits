import {spawn} from "node:child_process";
import {copyFile, mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile} from "node:fs/promises";
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
assert(
  Object.keys(packageJson.exports ?? {})
    .sort()
    .join(",") === ".,./copilot,./opencode,./pi",
  "Unexpected package export surface."
);
assert(
  packageJson.exports?.["."]?.import === "./dist/opencode.js" &&
    packageJson.exports["."]?.types === "./types/opencode.d.ts",
  "Unexpected root OpenCode export."
);
assert(
  packageJson.exports?.["./opencode"]?.import === "./dist/opencode.js" &&
    packageJson.exports["./opencode"]?.types === "./types/opencode.d.ts",
  "Unexpected explicit OpenCode export."
);
assert(
  packageJson.exports?.["./pi"]?.import === "./dist/pi.js" &&
    packageJson.exports["./pi"]?.types === "./types/pi.d.ts",
  "Unexpected pi export."
);
assert(
  packageJson.exports?.["./copilot"]?.import === "./dist/copilot.mjs" &&
    packageJson.exports["./copilot"]?.types === "./types/copilot.d.ts",
  "Unexpected Copilot export."
);
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

for (const file of ["dist/cli.js", "dist/opencode.js", "dist/pi.js", "dist/copilot.mjs"]) {
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
    const allowedHostImports =
      file === "dist/pi.js"
        ? Object.keys(packageJson.peerDependencies ?? {})
        : file === "dist/copilot.mjs"
          ? ["@github/copilot-sdk/extension"]
          : [];
    assert(
      builtinModules.includes(specifier) || allowedHostImports.includes(specifier),
      `${file} has undeclared runtime import ${specifier}.`
    );
  }
}

const copilotExtension = await readFile(join(root, "dist", "copilot.mjs"), "utf8");
assert(
  copilotExtension.includes("@github/copilot-sdk/extension"),
  "Copilot extension does not import the CLI-provided SDK."
);
assert(
  copilotExtension.includes("codex-limits-copilot-extension-v1"),
  "Copilot extension is missing its installer marker."
);
await smokeCopilotExtensionBundle();

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
  assert(!paths.has("dist/index.js"), "Packed artifact contains the legacy OpenCode bundle.");
  assert(!paths.has("types/index.d.ts"), "Packed artifact contains the legacy root declaration.");
  const packedCli = packed.files.find((file) => file.path === "dist/cli.js");
  if (process.platform !== "win32") {
    assert(Boolean(packedCli && (packedCli.mode & 0o111) !== 0), "Packed CLI is not executable.");
  }

  for (const required of [
    "dist/cli.js",
    "dist/opencode.js",
    "dist/pi.js",
    "dist/copilot.mjs",
    "dist/THIRD_PARTY_NOTICES.txt",
    "types/opencode.d.ts",
    "types/pi.d.ts",
    "types/copilot.d.ts",
    "scripts/postinstall.cjs",
    ".env.example",
    "docs/README.md",
    "docs/examples/codex-limits-output.example.json",
    "docs/readme/agent-integrations.md",
    "docs/readme/agents/copilot.md",
    "docs/readme/agents/opencode.md",
    "docs/readme/agents/pi.md",
    "docs/readme/compatibility.md",
    "docs/readme/json-output.md",
    "docs/schema/codex-limits.schema.json",
    "docs/photos/agents/copilot/copilot_result.png",
    "docs/photos/agents/opencode/opencode_result.png",
    "docs/photos/agents/pi/pi_result.png",
    "docs/photos/logo/logo.png",
    "docs/photos/logo/title-animation.svg",
    "docs/photos/terminal/final_result_large.png",
    "docs/photos/terminal/final_result_small.png",
    "README.md",
    "CONTRIBUTING.md",
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

  const rootModuleUrl = pathToFileURL(join(packedRoot, "dist", "opencode.js")).href;
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

  const subpathImport = await runResult(
    "node",
    [
      "--input-type=module",
      "--eval",
      'const root=await import("@simonesiega/codex-limits"); const opencode=await import("@simonesiega/codex-limits/opencode"); const piUrl=import.meta.resolve("@simonesiega/codex-limits/pi"); const copilotUrl=import.meta.resolve("@simonesiega/codex-limits/copilot"); if (root.default !== opencode.default || root.tui !== opencode.tui || !piUrl.endsWith("/dist/pi.js") || !copilotUrl.endsWith("/dist/copilot.mjs")) process.exit(1);',
    ],
    packedRoot,
    process.env
  );
  assert(subpathImport.exitCode === 0, "Node could not resolve the packed agent subpaths.");
  assert(subpathImport.stderr === "", "Packed subpath import unexpectedly wrote to stderr.");
} finally {
  await rm(temporaryRoot, {recursive: true, force: true});
}

async function smokeCopilotExtensionBundle(): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "codex-limits-copilot-smoke-"));
  try {
    const extensionDirectory = join(temporaryRoot, "extension");
    const sdkDirectory = join(temporaryRoot, "node_modules", "@github", "copilot-sdk");
    const resultPath = join(temporaryRoot, "result.json");
    await Promise.all([
      mkdir(extensionDirectory, {recursive: true}),
      mkdir(sdkDirectory, {recursive: true}),
    ]);
    await Promise.all([
      copyFile(join(root, "dist", "copilot.mjs"), join(extensionDirectory, "extension.mjs")),
      writeFile(
        join(sdkDirectory, "package.json"),
        JSON.stringify({
          name: "@github/copilot-sdk",
          type: "module",
          exports: {"./extension": "./extension.js"},
        }),
        "utf8"
      ),
      writeFile(
        join(sdkDirectory, "extension.js"),
        [
          'import {writeFile} from "node:fs/promises";',
          "export async function joinSession(config) {",
          '  const command = config.commands?.find((item) => item.name === "codex-limits");',
          '  if (!command) throw new Error("Expected command was not registered.");',
          "  const messages = [];",
          "  const hold = setInterval(() => undefined, 100);",
          "  const timeout = setTimeout(() => { clearInterval(hold); process.exitCode = 1; }, 5000);",
          "  setTimeout(async () => {",
          "    try {",
          "      await command.handler();",
          "      await writeFile(process.env.COPILOT_SMOKE_RESULT, JSON.stringify({messages}));",
          "    } finally {",
          "      clearTimeout(timeout);",
          "      clearInterval(hold);",
          "    }",
          "  }, 0);",
          "  return {",
          "    log: async (message, options) => messages.push({message, options}),",
          "  };",
          "}",
          "",
        ].join("\n"),
        "utf8"
      ),
    ]);

    const env = {...process.env};
    for (const key of Object.keys(env)) {
      if (key.startsWith("CODEX_LIMITS_") || key === "CODEX_HOME") {
        delete env[key];
      }
    }
    Object.assign(env, {
      HOME: join(temporaryRoot, "missing-home"),
      USERPROFILE: join(temporaryRoot, "missing-home"),
      APPDATA: join(temporaryRoot, "missing-app-data"),
      LOCALAPPDATA: join(temporaryRoot, "missing-local-app-data"),
      COPILOT_SMOKE_RESULT: resultPath,
    });

    const result = await runResult(
      "node",
      [join(extensionDirectory, "extension.mjs")],
      temporaryRoot,
      env
    );
    assert(result.exitCode === 0, "Copilot extension bundle did not start successfully.");
    assert(result.stdout === "", "Copilot extension wrote to reserved standard output.");
    assert(result.stderr === "", "Copilot extension unexpectedly wrote to standard error.");

    const smokeResult = JSON.parse(await readFile(resultPath, "utf8")) as {
      messages?: Array<{message?: unknown; options?: unknown}>;
    };
    assert(smokeResult.messages?.length === 1, "Copilot extension logged unexpected output.");
    const [message] = smokeResult.messages;
    assert(
      typeof message?.message === "string" && message.message.includes("Usage limits  Unavailable"),
      "Copilot extension did not render the shared limits view."
    );
    assert(message.options === undefined, "Copilot extension used an unexpected log mode.");
  } finally {
    await rm(temporaryRoot, {recursive: true, force: true});
  }
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

  assert(
    Object.keys(piModule).length === 1 && Object.keys(piModule)[0] === "default",
    "Pi bundle has an unexpected export surface."
  );
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
    COPILOT_HOME: join(home, ".copilot"),
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
    {args: ["agents", "install", "copilot"], includes: "copilot: installed"},
    {
      args: ["doctor", "--json"],
      json: true,
      includes: '"pi": "installed"',
    },
    {
      args: ["doctor", "--json"],
      json: true,
      includes: '"copilot": "installed"',
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
  const registeredPiPackage = piSettings.packages?.[0];
  assert(
    piSettings.packages?.length === 1 && typeof registeredPiPackage === "string",
    "Packed CLI registered an unexpected pi package path."
  );
  const [registeredPiRoot, expectedPiRoot] = await Promise.all([
    realpath(registeredPiPackage),
    realpath(packedRoot),
  ]);
  assert(
    registeredPiRoot === expectedPiRoot,
    "Packed CLI registered an unexpected pi package path."
  );

  const installedCopilotExtension = await readFile(
    join(home, ".copilot", "extensions", "codex-limits", "extension.mjs"),
    "utf8"
  );
  const packedCopilotExtension = await readFile(join(packedRoot, "dist", "copilot.mjs"), "utf8");
  assert(
    installedCopilotExtension === packedCopilotExtension,
    "Packed CLI installed an unexpected Copilot extension."
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
