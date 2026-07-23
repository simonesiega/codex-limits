import {stat} from "node:fs/promises";
import {homedir} from "node:os";
import {basename, dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {writeAgentFileAtomically} from "@/agents/shared/atomic-file";
import {
  AgentInstallError,
  type AgentInstallResult,
  type AgentIntegrationStatus,
} from "@/agents/types";
import {BoundedFileError, readBoundedUtf8File} from "@/package/core/utils/bounded-file";
import type {EnvironmentMap} from "@/package/core/types";
import {isRecord} from "@/package/core/utils/unknown";

const PACKAGE_NAME = "@simonesiega/codex-limits";
const COPILOT_BUNDLE_PATH = "dist/copilot.mjs";
const EXTENSION_MARKER = "codex-limits-copilot-extension-v1";
const ALTERNATIVE_ENTRY_NAMES = ["extension.cjs", "extension.js"];
const MAX_MANIFEST_BYTES = 100_000;
const MAX_EXTENSION_BYTES = 5_000_000;

interface CopilotConfigOptions {
  extensionPath?: string;
  packageRoot?: string;
  copilotHome?: string;
  homeDirectory?: string;
  env?: EnvironmentMap;
}

/** Installs the bundled extension in GitHub Copilot CLI's user extension directory. */
export async function installCopilotIntegration(
  options: CopilotConfigOptions = {}
): Promise<AgentInstallResult> {
  const paths = resolveCopilotPaths(options);
  const bundle = await readCopilotBundle(paths.packageRoot);
  await assertNoAlternativeEntryPoints(paths.extensionPath);
  const existing = await readExistingExtension(paths.extensionPath);

  if (existing === bundle) {
    return {changed: false, configPaths: [paths.extensionPath]};
  }
  if (existing !== null && !existing.includes(EXTENSION_MARKER)) {
    throw new AgentInstallError("The GitHub Copilot CLI extension path is already in use.");
  }

  try {
    await writeAgentFileAtomically(paths.extensionPath, bundle);
  } catch {
    throw new AgentInstallError("Could not safely install the GitHub Copilot CLI extension.");
  }

  return {changed: true, configPaths: [paths.extensionPath]};
}

/** Checks the bounded user extension entry without returning its contents or path. */
export async function inspectCopilotIntegration(
  options: CopilotConfigOptions = {}
): Promise<AgentIntegrationStatus> {
  const {extensionPath} = resolveCopilotPaths(options);

  try {
    const content = await readBoundedUtf8File(extensionPath, MAX_EXTENSION_BYTES);
    return content.includes(EXTENSION_MARKER) ? "installed" : "not-installed";
  } catch (error) {
    return error instanceof BoundedFileError && error.code === "not-found"
      ? "not-installed"
      : "unknown";
  }
}

interface ResolvedCopilotPaths {
  extensionPath: string;
  packageRoot: string;
}

function resolveCopilotPaths(options: CopilotConfigOptions): ResolvedCopilotPaths {
  const homeDirectory = resolve(options.homeDirectory ?? homedir());
  const env = options.env ?? process.env;
  const configuredHome = options.copilotHome ?? env.COPILOT_HOME ?? "";
  const copilotHome = configuredHome
    ? resolveTildePath(configuredHome, homeDirectory)
    : join(homeDirectory, ".copilot");

  return {
    extensionPath: resolve(
      options.extensionPath ?? join(copilotHome, "extensions", "codex-limits", "extension.mjs")
    ),
    packageRoot: resolve(options.packageRoot ?? getCurrentPackageRoot()),
  };
}

function getCurrentPackageRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return basename(moduleDirectory) === "dist"
    ? dirname(moduleDirectory)
    : resolve(moduleDirectory, "../../..");
}

function resolveTildePath(path: string, homeDirectory: string): string {
  if (path === "~") {
    return homeDirectory;
  }
  if (path.startsWith("~/") || (process.platform === "win32" && path.startsWith("~\\"))) {
    return resolve(homeDirectory, path.slice(2));
  }
  return resolve(path);
}

async function readCopilotBundle(packageRoot: string): Promise<string> {
  try {
    const [rootDetails, manifestContent, bundle] = await Promise.all([
      stat(packageRoot),
      readBoundedUtf8File(join(packageRoot, "package.json"), MAX_MANIFEST_BYTES),
      readBoundedUtf8File(join(packageRoot, COPILOT_BUNDLE_PATH), MAX_EXTENSION_BYTES),
    ]);
    const manifest = JSON.parse(manifestContent) as unknown;
    if (
      !rootDetails.isDirectory() ||
      !isRecord(manifest) ||
      manifest.name !== PACKAGE_NAME ||
      !bundle.includes(EXTENSION_MARKER)
    ) {
      throw new Error("invalid bundle");
    }
    return bundle;
  } catch {
    throw new AgentInstallError("The GitHub Copilot CLI extension bundle is unavailable.");
  }
}

async function assertNoAlternativeEntryPoints(path: string): Promise<void> {
  for (const name of ALTERNATIVE_ENTRY_NAMES) {
    try {
      await readBoundedUtf8File(join(dirname(path), name), MAX_EXTENSION_BYTES);
      throw new AgentInstallError(
        "The GitHub Copilot CLI extension directory already contains another entry point."
      );
    } catch (error) {
      if (error instanceof AgentInstallError) {
        throw error;
      }
      if (error instanceof BoundedFileError && error.code === "not-found") {
        continue;
      }
      throw new AgentInstallError("Could not safely inspect the GitHub Copilot CLI extension.");
    }
  }
}

async function readExistingExtension(path: string): Promise<string | null> {
  try {
    return await readBoundedUtf8File(path, MAX_EXTENSION_BYTES);
  } catch (error) {
    if (error instanceof BoundedFileError) {
      if (error.code === "not-found") {
        return null;
      }
      if (error.code === "too-large") {
        throw new AgentInstallError(
          "The existing GitHub Copilot CLI extension is too large to update safely."
        );
      }
    }
    throw new AgentInstallError("Could not safely read the GitHub Copilot CLI extension.");
  }
}
