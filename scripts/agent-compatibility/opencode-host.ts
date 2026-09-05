import {createHash} from "node:crypto";
import {open, readFile, writeFile} from "node:fs/promises";
import {createServer, type Server} from "node:http";
import {basename, join} from "node:path";
import {assert, type CompatibilityHarness, executablePath} from "./harness";
import {probeInteractiveHost} from "./interactive-host";

interface PackageRegistry {
  server: Server;
  url: string;
  requests: string[];
}

interface OpencodeHostProbeOptions {
  harness: CompatibilityHarness;
  hostRoot: string;
  packageTarball: string;
  packageVersion: string;
  home: string;
  workspace: string;
  environment: NodeJS.ProcessEnv;
}

/** Exercises the packed plugin through a real OpenCode host. */
export async function probeOpencode({
  harness,
  hostRoot,
  packageTarball,
  packageVersion,
  home,
  workspace,
  environment,
}: OpencodeHostProbeOptions): Promise<void> {
  const registry = await startPackageRegistry(packageTarball, packageVersion);
  const npmConfigPath = join(home, ".npmrc");
  try {
    await writeFile(npmConfigPath, `@simonesiega:registry=${registry.url}/\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await probeInteractiveHost({
      harness,
      command: await opencodeExecutable(hostRoot),
      args: [workspace, "--print-logs", "--log-level", "ERROR"],
      cwd: workspace,
      environment: {
        ...environment,
        NPM_CONFIG_CACHE: join(home, "opencode-npm-cache"),
        NPM_CONFIG_USERCONFIG: npmConfigPath,
        XDG_CACHE_HOME: join(home, ".cache"),
      },
      readiness: /ctrl\+p\s+commands|Ask anything/i,
      expectedOutput: /Live usage requires Codex authentication/i,
      registryRequests: registry.requests,
    });
    assertPackageRegistryUsed(registry.requests, packageTarball);
  } finally {
    await closeServer(registry.server);
  }
}

/** Starts the bounded local npm registry used to load the packed OpenCode plugin. */
async function startPackageRegistry(
  packageTarball: string,
  version: string
): Promise<PackageRegistry> {
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
