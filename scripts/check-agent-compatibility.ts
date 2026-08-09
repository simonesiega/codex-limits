import {spawn, type ChildProcess, type ChildProcessWithoutNullStreams} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, mkdir, open, readFile, rm, writeFile} from "node:fs/promises";
import {createServer, type Server} from "node:http";
import {tmpdir} from "node:os";
import {basename, join, resolve} from "node:path";

interface CompatibilityOptions {
  agent: "opencode" | "pi" | "copilot";
  hostRoot: string;
  packageTarball: string;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface ProcessFailureMonitor {
  promise: Promise<never>;
  dispose: () => void;
}

interface PiResponseWaiter {
  promise: Promise<Record<string, unknown>>;
  dispose: () => void;
}

interface InteractiveHostProbeOptions {
  registryRequests?: string[];
  startupConfirmation?: RegExp;
  useTmux?: boolean;
}

const MAX_SUBPROCESS_OUTPUT_CHARACTERS = 1_000_000;
const MAX_RPC_MESSAGE_BYTES = 1_000_000;
const INTERACTIVE_READY_STABILIZATION_MS = 500;
const INTERACTIVE_READINESS_FALLBACK_MS = 15_000;
const SETUP_TIMEOUT_MS = 120_000;
const root = resolve(import.meta.dir, "..");
const options = parseOptions(process.argv.slice(2));
const temporaryRoot = await mkdtemp(join(tmpdir(), `codex-limits-${options.agent}-compat-`));

try {
  const packageRoot = join(temporaryRoot, "package");
  const home = join(temporaryRoot, "home");
  const workspace = join(temporaryRoot, "workspace");
  await Promise.all([
    mkdir(packageRoot),
    mkdir(join(home, "tmp"), {recursive: true}),
    mkdir(workspace),
  ]);

  await run(
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
  const install = await runResult(
    cli,
    ["agents", "install", options.agent],
    workspace,
    environment
  );
  assert(
    !install.timedOut &&
      install.exitCode === 0 &&
      install.stdout.includes(`${options.agent}: installed`),
    `The packed CLI could not install the ${options.agent} integration: ${commandFailureDetail(install)}`
  );
  assert(install.stderr === "", `The ${options.agent} installer wrote to standard error.`);

  if (options.agent === "pi") {
    await probePi(options.hostRoot, workspace, environment, true);
  } else if (options.agent === "opencode") {
    const registry = await startPackageRegistry(options.packageTarball, packageJson.version);
    const npmConfigPath = join(home, ".npmrc");
    try {
      await writeFile(npmConfigPath, `@simonesiega:registry=${registry.url}/\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await probeInteractiveHost(
        await opencodeExecutable(options.hostRoot),
        [workspace, "--print-logs", "--log-level", "ERROR"],
        workspace,
        {
          ...environment,
          NPM_CONFIG_CACHE: join(home, "opencode-npm-cache"),
          NPM_CONFIG_USERCONFIG: npmConfigPath,
          XDG_CACHE_HOME: join(home, ".cache"),
        },
        /ctrl\+p\s+commands|Ask anything/i,
        /Live usage requires Codex authentication/i,
        {registryRequests: registry.requests}
      );
      assertPackageRegistryUsed(registry.requests, options.packageTarball);
    } finally {
      await closeServer(registry.server);
    }
  } else {
    await probeInteractiveHost(
      executablePath(options.hostRoot, "copilot"),
      [
        "--experimental",
        "--disable-builtin-mcps",
        "--no-auto-update",
        "--no-remote",
        "--no-remote-export",
        "--no-custom-instructions",
        "--no-color",
        "--no-mouse",
        "--log-level",
        "error",
        "-C",
        workspace,
      ],
      workspace,
      environment,
      /commands|Please use \/login/i,
      /Live usage requires Codex authentication/i,
      {
        startupConfirmation: /Do you trust the files in this folder\?/i,
        useTmux: true,
      }
    );
  }

  await verifyUninstall(cli, options.agent, workspace, environment);
  if (options.agent === "pi") {
    await probePi(options.hostRoot, workspace, environment, false);
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

async function probePi(
  hostRoot: string,
  workspace: string,
  environment: NodeJS.ProcessEnv,
  expectInstalled: boolean
): Promise<void> {
  const host = spawn(
    executablePath(hostRoot, "pi"),
    ["--mode", "rpc", "--no-session", "--offline", "--no-context-files", "--approve"],
    {cwd: workspace, env: environment, stdio: ["pipe", "pipe", "pipe"]}
  );
  const failure = monitorProcessFailure(host, "Could not start the real pi host");
  let stderr = "";
  host.stderr.on("data", (chunk: Buffer) => {
    stderr = appendBounded(stderr, chunk.toString("utf8"));
  });

  try {
    const commandResponse = await requestPi(host, failure, "commands", {type: "get_commands"});
    const commandData = commandResponse.data;
    assert(
      commandResponse.success === true &&
        isRecord(commandData) &&
        Array.isArray(commandData.commands),
      "The real pi host returned an invalid command-discovery response."
    );
    const discovered = commandData.commands.some(
      (command) =>
        isRecord(command) && command.name === "codex-limits" && command.source === "extension"
    );
    assert(
      discovered === expectInstalled,
      expectInstalled
        ? "The real pi host did not discover /codex-limits from the packed package."
        : "The real pi host still discovered /codex-limits after uninstall."
    );

    if (expectInstalled) {
      const dispatchResponse = await requestPi(host, failure, "dispatch", {
        type: "prompt",
        message: "/codex-limits",
      });
      assert(
        dispatchResponse.success === true && dispatchResponse.command === "prompt",
        "The real pi host could not dispatch /codex-limits."
      );

      const messagesResponse = await requestPi(host, failure, "messages", {
        type: "get_messages",
      });
      const messageData = messagesResponse.data;
      assert(
        messagesResponse.success === true &&
          isRecord(messageData) &&
          Array.isArray(messageData.messages),
        "The real pi host returned an invalid message-history response."
      );
      assert(
        messageData.messages.length === 0,
        "The real pi host forwarded /codex-limits into the model conversation."
      );
    }
    assert(stderr === "", `The real pi host wrote to standard error: ${boundedText(stderr)}`);
  } finally {
    await terminate(host, false);
    failure.dispose();
  }
}

async function requestPi(
  host: ChildProcessWithoutNullStreams,
  failure: ProcessFailureMonitor,
  id: string,
  command: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = waitForJsonResponse(host, id, 30_000);
  try {
    await Promise.race([
      writeProcessInput(host, `${JSON.stringify({id, ...command})}\n`),
      failure.promise,
    ]);
    return await Promise.race([response.promise, failure.promise]);
  } finally {
    response.dispose();
  }
}

async function verifyUninstall(
  cli: string,
  agent: CompatibilityOptions["agent"],
  workspace: string,
  environment: NodeJS.ProcessEnv
): Promise<void> {
  const uninstall = await runResult(cli, ["agents", "uninstall", agent], workspace, environment);
  assert(
    !uninstall.timedOut && uninstall.exitCode === 0,
    `The packed CLI could not uninstall the ${agent} integration: ${commandFailureDetail(uninstall)}`
  );
  assert(
    uninstall.stdout.includes(`${agent}: uninstalled`),
    `The packed CLI did not report the ${agent} integration as uninstalled.`
  );
  assert(uninstall.stderr === "", `The ${agent} uninstaller wrote to standard error.`);

  const doctor = await runResult(cli, ["doctor", "--json"], workspace, environment);
  assert(
    !doctor.timedOut && doctor.exitCode === 0 && doctor.stderr === "",
    `Packed diagnostics failed after uninstall: ${commandFailureDetail(doctor)}`
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

function monitorProcessFailure(
  host: ChildProcessWithoutNullStreams,
  context: string
): ProcessFailureMonitor {
  let rejectFailure: (error: Error) => void = () => undefined;
  let failed = false;
  const promise = new Promise<never>((_resolve, reject) => {
    rejectFailure = reject;
  });
  void promise.catch(() => undefined);

  const fail = (error: unknown): void => {
    if (failed) {
      return;
    }
    failed = true;
    rejectFailure(new Error(`${context}: ${safeErrorMessage(error)}`));
  };
  host.once("error", fail);
  host.stdin.once("error", fail);

  return {
    promise,
    dispose: () => {
      host.off("error", fail);
      host.stdin.off("error", fail);
    },
  };
}

function writeProcessInput(host: ChildProcessWithoutNullStreams, value: string): Promise<void> {
  return new Promise((resolveWrite, reject) => {
    host.stdin.write(value, (error?: Error | null) => {
      if (error) {
        reject(error);
      } else {
        resolveWrite();
      }
    });
  });
}

function waitForJsonResponse(
  host: ChildProcessWithoutNullStreams,
  id: string,
  timeoutMs: number
): PiResponseWaiter {
  let buffer = "";
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let resolveResponse: (response: Record<string, unknown>) => void = () => undefined;
  let rejectResponse: (error: Error) => void = () => undefined;
  const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });

  function cleanup(): void {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    host.stdout.off("data", onData);
    host.off("exit", onExit);
  }

  function finish(error?: Error, response?: Record<string, unknown>): void {
    if (settled) {
      return;
    }
    settled = true;
    cleanup();
    if (error) {
      rejectResponse(error);
    } else {
      resolveResponse(response ?? {});
    }
  }

  function onData(chunk: Buffer): void {
    buffer += chunk.toString("utf8");
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline === -1) {
        if (Buffer.byteLength(buffer, "utf8") > MAX_RPC_MESSAGE_BYTES) {
          finish(new Error("The real pi host emitted oversized RPC output."));
        }
        return;
      }
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (Buffer.byteLength(line, "utf8") > MAX_RPC_MESSAGE_BYTES) {
        finish(new Error("The real pi host emitted oversized RPC output."));
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch {
        finish(new Error("The real pi host emitted malformed RPC output."));
        return;
      }
      if (!isRecord(parsed)) {
        finish(new Error("The real pi host emitted malformed RPC output."));
        return;
      }
      if (parsed.type === "response" && parsed.id === id) {
        finish(undefined, parsed);
        return;
      }
    }
  }

  function onExit(): void {
    finish(new Error(`The real pi host exited before response ${id}.`));
  }

  // The response can reject while the stdin write is still pending. Mark it handled immediately;
  // requestPi awaits the original promise once the write succeeds.
  void promise.catch(() => undefined);
  timeout = setTimeout(
    () => finish(new Error(`Timed out waiting for pi RPC response ${id}.`)),
    timeoutMs
  );
  host.stdout.on("data", onData);
  host.on("exit", onExit);
  if (host.exitCode !== null || host.signalCode !== null) {
    onExit();
  }

  return {
    promise,
    dispose: () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
    },
  };
}

async function probeInteractiveHost(
  command: string,
  args: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  readiness: RegExp,
  expectedOutput: RegExp,
  options: InteractiveHostProbeOptions = {}
): Promise<void> {
  const commandLine = [command, ...args].map(shellQuote).join(" ");
  const tmuxSocket = `codex-limits-${process.pid}`;
  const interactiveCommandLine = options.useTmux
    ? [
        "tmux",
        "-L",
        tmuxSocket,
        "-f",
        "/dev/null",
        "new-session",
        "-x",
        "100",
        "-y",
        "32",
        commandLine,
      ]
        .map(shellQuote)
        .join(" ")
    : commandLine;
  const host = spawn(
    "script",
    ["--quiet", "--return", "--flush", "--command", interactiveCommandLine, "/dev/null"],
    {cwd, env: environment, detached: true, stdio: ["pipe", "pipe", "pipe"]}
  );
  const failure = monitorProcessFailure(
    host,
    `Could not start interactive host ${basename(command)}`
  );

  let output = "";
  let readinessOutput = "";
  let startupOutput = "";
  let commandTypedOutput = "";
  let postSubmissionOutput = "";
  let diagnosticTail = "";
  let hostDiagnostics = "";
  let commandTyped = false;
  let commandSubmitted = false;
  const result = new Promise<void>((resolveProbe, reject) => {
    let settled = false;
    let startupConfirmed = options.startupConfirmation === undefined;
    let readinessObserved = false;
    let commandTypingTimer: ReturnType<typeof setTimeout> | undefined;
    let submitFallback: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      const requests = options.registryRequests?.length
        ? ` Registry requests: ${options.registryRequests.join(", ")}.`
        : "";
      const commandState = commandSubmitted
        ? "command submitted"
        : commandTyped
          ? "command typed"
          : "command not typed";
      finish(
        new Error(
          `Timed out waiting for the real host to dispatch /codex-limits (${commandState}).${requests}${hostDiagnostics ? ` Host diagnostics: ${boundedText(hostDiagnostics)}` : ""} Startup output: ${boundedTerminalOutput(startupOutput)} Command-entry output: ${boundedTerminalOutput(commandTypedOutput)} Post-submission output: ${boundedTerminalOutput(postSubmissionOutput)}`
        )
      );
    }, 45_000);

    const cleanup = (): void => {
      clearTimeout(timeout);
      if (commandTypingTimer) {
        clearTimeout(commandTypingTimer);
      }
      if (submitFallback) {
        clearTimeout(submitFallback);
      }
      host.stdout.off("data", inspect);
      host.stderr.off("data", inspect);
      host.off("exit", onExit);
    };
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
      } else {
        resolveProbe();
      }
    };
    const submitCommand = (): void => {
      if (!commandTyped || commandSubmitted || settled) {
        return;
      }
      postSubmissionOutput = "";
      commandSubmitted = true;
      if (submitFallback) {
        clearTimeout(submitFallback);
        submitFallback = undefined;
      }
      void writeProcessInput(host, "\r").catch((error: unknown) =>
        finish(
          new Error(`Could not submit /codex-limits to the real host: ${safeErrorMessage(error)}`)
        )
      );
    };
    const typeCommand = (): void => {
      if (commandTyped || settled) {
        return;
      }
      commandTyped = true;
      if (commandTypingTimer) {
        clearTimeout(commandTypingTimer);
        commandTypingTimer = undefined;
      }
      void writeProcessInput(host, "/codex-limits")
        .then(() => {
          if (!settled && !commandSubmitted) {
            // Interactive hosts expose no shared completion event, so submit after a bounded
            // fallback only when the rendered command echo is unavailable.
            submitFallback = setTimeout(submitCommand, 2_000);
          }
        })
        .catch((error: unknown) =>
          finish(
            new Error(`Could not type /codex-limits in the real host: ${safeErrorMessage(error)}`)
          )
        );
    };
    const inspect = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      output = appendBounded(output, text);
      diagnosticTail = `${diagnosticTail}${text}`.slice(-20_000);
      const plainDiagnosticTail = stripTerminalControls(diagnosticTail);
      const diagnosticIndex = plainDiagnosticTail.lastIndexOf("[tui.plugin]");
      if (diagnosticIndex >= 0) {
        hostDiagnostics = plainDiagnosticTail.slice(diagnosticIndex);
      }
      if (commandSubmitted) {
        postSubmissionOutput = appendBounded(postSubmissionOutput, text);
      } else if (commandTyped) {
        commandTypedOutput = appendBounded(commandTypedOutput, text);
      } else {
        startupOutput = appendBounded(startupOutput, text);
      }
      const plainOutput = stripTerminalControls(output);
      const plainPostSubmissionOutput = stripTerminalControls(postSubmissionOutput);
      if (!startupConfirmed) {
        if (options.startupConfirmation?.test(plainOutput)) {
          startupConfirmed = true;
          readinessOutput = "";
          void writeProcessInput(host, "\r").catch((error: unknown) =>
            finish(
              new Error(`Could not confirm the isolated host workspace: ${safeErrorMessage(error)}`)
            )
          );
        }
      } else {
        readinessOutput = appendBounded(readinessOutput, text);
      }
      const plainReadinessOutput = stripTerminalControls(readinessOutput);
      if (
        startupConfirmed &&
        !commandTyped &&
        !readinessObserved &&
        (readiness.test(readinessOutput) || readiness.test(plainReadinessOutput))
      ) {
        readinessObserved = true;
        if (commandTypingTimer) {
          clearTimeout(commandTypingTimer);
        }
        // Allow the completed UI frame to establish input focus, then act on readiness promptly.
        commandTypingTimer = setTimeout(typeCommand, INTERACTIVE_READY_STABILIZATION_MS);
      } else if (startupConfirmed && !commandTyped && !commandTypingTimer) {
        // Input without a readiness signal is a last resort for hosts whose UI wording changed.
        commandTypingTimer = setTimeout(typeCommand, INTERACTIVE_READINESS_FALLBACK_MS);
      }
      if (
        commandTyped &&
        !commandSubmitted &&
        /\/codex-limits/i.test(stripTerminalControls(commandTypedOutput))
      ) {
        submitCommand();
      }
      if (commandSubmitted && expectedOutput.test(plainPostSubmissionOutput)) {
        finish();
      }
    };
    const onExit = (code: number | null): void => {
      finish(
        new Error(
          `The real host exited with code ${code ?? 1}. Output: ${boundedTerminalOutput(output)}`
        )
      );
    };

    host.stdout.on("data", inspect);
    host.stderr.on("data", inspect);
    host.on("exit", onExit);
    void failure.promise.catch((error: Error) => finish(error));
  });

  try {
    await result;
  } finally {
    try {
      await terminate(host, true);
      if (options.useTmux) {
        await stopTmux(tmuxSocket, cwd, environment);
      }
    } finally {
      failure.dispose();
    }
  }
}

async function stopTmux(
  socket: string,
  cwd: string,
  environment: NodeJS.ProcessEnv
): Promise<void> {
  const result = await runResult(
    "tmux",
    ["-L", socket, "kill-server"],
    cwd,
    environment,
    5_000
  ).catch(() => undefined);
  if (result?.timedOut) {
    throw new Error("Timed out while terminating the real host's tmux server.");
  }
}

async function startPackageRegistry(
  packageTarball: string,
  version: string
): Promise<{server: Server; url: string; requests: string[]}> {
  const tarball = await readFile(packageTarball);
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    if (requests.length < 100) {
      requests.push(path.slice(0, 200));
    }

    if (path === `/tarballs/${basename(packageTarball)}`) {
      response.writeHead(200, {"content-type": "application/octet-stream"});
      response.end(tarball);
      return;
    }
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(path.split("?")[0] ?? "");
    } catch {
      response.writeHead(400, {"content-type": "application/json"});
      response.end(JSON.stringify({error: "invalid_url"}));
      return;
    }
    if (decodedPath === "/@simonesiega/codex-limits") {
      const address = server.address();
      assert(address && typeof address === "object", "Local package registry is unavailable.");
      const tarballUrl = `http://127.0.0.1:${address.port}/tarballs/${basename(packageTarball)}`;
      const packageMetadata = {
        name: "@simonesiega/codex-limits",
        version,
        type: "module",
        dist: {
          integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
          shasum: createHash("sha1").update(tarball).digest("hex"),
          tarball: tarballUrl,
        },
      };
      response.writeHead(200, {"content-type": "application/json"});
      response.end(
        JSON.stringify({
          name: packageMetadata.name,
          "dist-tags": {latest: version},
          versions: {[version]: packageMetadata},
        })
      );
      return;
    }
    if (path.startsWith("/-/ping")) {
      response.writeHead(200, {"content-type": "application/json"});
      response.end("{}");
      return;
    }

    response.writeHead(404, {"content-type": "application/json"});
    response.end(JSON.stringify({error: "not_found"}));
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  assert(address && typeof address === "object", "Local package registry did not start.");
  return {server, url: `http://127.0.0.1:${address.port}`, requests};
}

function assertPackageRegistryUsed(requests: string[], packageTarball: string): void {
  const metadataRequested = requests.some((path) => {
    try {
      return decodeURIComponent(path.split("?")[0] ?? "") === "/@simonesiega/codex-limits";
    } catch {
      return false;
    }
  });
  const tarballRequested = requests.includes(`/tarballs/${basename(packageTarball)}`);
  assert(
    metadataRequested && tarballRequested,
    "The real OpenCode host did not load the packed Codex Limits artifact."
  );
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
    server.closeAllConnections();
  });
}

async function opencodeExecutable(hostRoot: string): Promise<string> {
  const publicExecutable = executablePath(hostRoot, "opencode");
  const handle = await open(publicExecutable, "r");
  try {
    const buffer = Buffer.alloc(4_096);
    const {bytesRead} = await handle.read(buffer, 0, buffer.length, 0);
    const launcher = buffer.subarray(0, bytesRead).toString("utf8");
    if (!launcher.includes("postinstall script was not run")) {
      return publicExecutable;
    }
  } finally {
    await handle.close();
  }

  // opencode-ai intentionally replaces its public launcher in postinstall. CI disables lifecycle
  // scripts, so use the installed optional platform package only when that launcher is a stub.
  const architecture = process.arch === "arm64" ? "arm64" : "x64";
  return join(hostRoot, "node_modules", `opencode-linux-${architecture}`, "bin", "opencode");
}

function executablePath(prefix: string, name: string): string {
  return join(prefix, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function stripTerminalControls(value: string): string {
  return value
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1bP[\s\S]*?\x1b\\/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function boundedTerminalOutput(output: string): string {
  return boundedText(stripTerminalControls(output));
}

function appendBounded(current: string, addition: string): string {
  return `${current}${addition}`.slice(-MAX_SUBPROCESS_OUTPUT_CHARACTERS);
}

function boundedText(value: string, maxLength = 4_000): string {
  return value.replaceAll(temporaryRoot, "<temporary>").trim().slice(-maxLength);
}

function safeErrorMessage(error: unknown): string {
  return boundedText(error instanceof Error ? error.message : String(error));
}

function commandFailureDetail(result: CommandResult): string {
  if (result.timedOut) {
    return `timed out after ${SETUP_TIMEOUT_MS}ms`;
  }
  return (
    [boundedText(result.stderr), boundedText(result.stdout)].filter(Boolean).join(" | ") ||
    `exit code ${result.exitCode}`
  );
}

async function terminate(host: ChildProcess, processGroup: boolean): Promise<void> {
  if (host.exitCode !== null || host.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolveExit) => {
    let settled = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (forceTimer) {
        clearTimeout(forceTimer);
      }
      if (hardTimer) {
        clearTimeout(hardTimer);
      }
      host.off("exit", finish);
      host.off("close", finish);
      resolveExit();
    };

    host.once("exit", finish);
    host.once("close", finish);
    if (host.exitCode !== null || host.signalCode !== null) {
      finish();
      return;
    }

    try {
      host.stdin?.end();
    } catch {
      // The input stream may already be closed while process termination is still pending.
    }
    signalProcess(host, "SIGTERM", processGroup);
    forceTimer = setTimeout(() => signalProcess(host, "SIGKILL", processGroup), 2_000);
    hardTimer = setTimeout(finish, 4_000);
  });
}

function signalProcess(host: ChildProcess, signal: NodeJS.Signals, processGroup: boolean): void {
  try {
    if (processGroup && host.pid !== undefined) {
      process.kill(-host.pid, signal);
    } else {
      host.kill(signal);
    }
  } catch {
    try {
      host.kill(signal);
    } catch {
      // The process exited between the exitCode check and signal delivery.
    }
  }
}

function run(
  command: string,
  args: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv
): Promise<void> {
  return runResult(command, args, cwd, environment).then((result) => {
    if (!result.timedOut && result.exitCode === 0) {
      return;
    }
    const detail = [boundedText(result.stderr), boundedText(result.stdout)]
      .filter(Boolean)
      .join(" | ");
    const reason = result.timedOut ? `timed out after ${SETUP_TIMEOUT_MS}ms` : "failed";
    throw new Error(
      `${basename(command)} ${reason} during compatibility setup${detail ? `: ${detail}` : "."}`
    );
  });
}

function runResult(
  command: string,
  args: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  timeoutMs = SETUP_TIMEOUT_MS
): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const useProcessGroup = process.platform !== "win32";
    const child = spawn(command, args, {
      cwd,
      env: environment,
      detached: useProcessGroup,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      void terminate(child, useProcessGroup).then(() => finish(child.exitCode ?? 1));
    }, timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timeout);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("error", onError);
      child.off("close", finish);
    };
    const finish = (exitCode: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolveResult({exitCode: exitCode ?? 1, stdout, stderr, timedOut});
    };
    const onError = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error(`Could not start ${basename(command)}: ${safeErrorMessage(error)}`));
    };
    const onStdout = (chunk: Buffer): void => {
      stdout = appendBounded(stdout, chunk.toString("utf8"));
    };
    const onStderr = (chunk: Buffer): void => {
      stderr = appendBounded(stderr, chunk.toString("utf8"));
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("error", onError);
    child.once("close", finish);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
