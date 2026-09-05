import {spawn, type ChildProcessWithoutNullStreams} from "node:child_process";
import {
  assert,
  type CompatibilityHarness,
  executablePath,
  isRecord,
  type ProcessFailureMonitor,
} from "./harness";

interface PiResponseWaiter {
  promise: Promise<Record<string, unknown>>;
  dispose: () => void;
}

interface PiHostProbeOptions {
  harness: CompatibilityHarness;
  hostRoot: string;
  workspace: string;
  environment: NodeJS.ProcessEnv;
  expectInstalled: boolean;
}

const MAX_RPC_MESSAGE_BYTES = 1_000_000;

/** Exercises pi command discovery and dispatch through its RPC host mode. */
export async function probePi({
  harness,
  hostRoot,
  workspace,
  environment,
  expectInstalled,
}: PiHostProbeOptions): Promise<void> {
  const host = spawn(
    executablePath(hostRoot, "pi"),
    ["--mode", "rpc", "--no-session", "--offline", "--no-context-files", "--approve"],
    {cwd: workspace, env: environment, stdio: ["pipe", "pipe", "pipe"]}
  );
  const failure = harness.monitorProcessFailure(host, "Could not start the real pi host");
  let stderr = "";
  host.stderr.on("data", (chunk: Buffer) => {
    stderr = harness.appendBounded(stderr, chunk.toString("utf8"));
  });

  try {
    const commandResponse = await requestPi(harness, host, failure, "commands", {
      type: "get_commands",
    });
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
      const dispatchResponse = await requestPi(harness, host, failure, "dispatch", {
        type: "prompt",
        message: "/codex-limits",
      });
      assert(
        dispatchResponse.success === true && dispatchResponse.command === "prompt",
        "The real pi host could not dispatch /codex-limits."
      );

      const messagesResponse = await requestPi(harness, host, failure, "messages", {
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
    assert(
      stderr === "",
      `The real pi host wrote to standard error: ${harness.boundedText(stderr)}`
    );
  } finally {
    await harness.terminate(host, false);
    failure.dispose();
  }
}

async function requestPi(
  harness: CompatibilityHarness,
  host: ChildProcessWithoutNullStreams,
  failure: ProcessFailureMonitor,
  id: string,
  command: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = waitForJsonResponse(host, id, 30_000);
  try {
    await Promise.race([
      harness.writeProcessInput(host, `${JSON.stringify({id, ...command})}\n`),
      failure.promise,
    ]);
    return await Promise.race([response.promise, failure.promise]);
  } finally {
    response.dispose();
  }
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
