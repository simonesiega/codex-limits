import {lstat, rmdir, stat} from "node:fs/promises";
import {homedir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {removeAgentFileIfUnchanged, writeAgentFileAtomically} from "@/agents/shared/atomic-file";
import {
  createAgentOperationError,
  isAgentOperationError,
  type AgentOperation,
} from "@/agents/shared/operation";
import {resolvePackageRoot, resolveTildePath} from "@/agents/shared/paths";
import {
  AgentInstallError,
  type AgentInstallResult,
  type AgentIntegrationStatus,
  AgentUninstallError,
  type AgentUninstallResult,
} from "@/agents/types";
import {BoundedFileError, readBoundedUtf8File} from "@/package/core/utils/bounded-file";
import type {EnvironmentMap} from "@/package/core/types";
import {readEnvValue} from "@/package/core/utils/env";
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
  await assertSafeExtensionDirectory(paths.extensionPath);
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
    await writeAgentFileAtomically(paths.extensionPath, bundle, existing);
  } catch {
    throw new AgentInstallError("Could not safely install the GitHub Copilot CLI extension.");
  }

  return {changed: true, configPaths: [paths.extensionPath]};
}

/** Removes only a recognized Codex Limits-managed Copilot extension entry point. */
export async function uninstallCopilotIntegration(
  options: CopilotConfigOptions = {}
): Promise<AgentUninstallResult> {
  const {extensionPath} = resolveCopilotPaths(options);
  await assertSafeExtensionDirectory(extensionPath, "uninstall");
  await assertNoAlternativeEntryPoints(extensionPath, "uninstall");
  const existing = await readExistingExtension(extensionPath, "uninstall");
  if (existing === null) {
    return {changed: false, configPaths: [extensionPath]};
  }
  if (!existing.includes(EXTENSION_MARKER)) {
    throw new AgentUninstallError(
      "The GitHub Copilot CLI extension path is not recognized as Codex Limits-managed."
    );
  }

  try {
    await assertSafeExtensionDirectory(extensionPath, "uninstall");
    await removeAgentFileIfUnchanged(extensionPath, existing);
  } catch {
    throw new AgentUninstallError("Could not safely uninstall the GitHub Copilot CLI extension.");
  }

  // Remove the dedicated directory only when it is empty; unrelated sibling files are preserved.
  await rmdir(dirname(extensionPath)).catch(() => undefined);
  return {changed: true, configPaths: [extensionPath]};
}

/** Checks the bounded user extension entry without returning its contents or path. */
export async function inspectCopilotIntegration(
  options: CopilotConfigOptions = {}
): Promise<AgentIntegrationStatus> {
  const {extensionPath} = resolveCopilotPaths(options);

  try {
    await assertSafeExtensionDirectory(extensionPath);
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
  const configuredHome = options.copilotHome ?? readEnvValue(env, "COPILOT_HOME");
  const copilotHome = configuredHome
    ? resolveTildePath(configuredHome, homeDirectory)
    : join(homeDirectory, ".copilot");

  return {
    extensionPath: resolve(
      options.extensionPath ?? join(copilotHome, "extensions", "codex-limits", "extension.mjs")
    ),
    packageRoot: resolve(options.packageRoot ?? resolvePackageRoot()),
  };
}

async function assertSafeExtensionDirectory(
  extensionPath: string,
  operation: AgentOperation = "install"
): Promise<void> {
  try {
    const details = await lstat(dirname(extensionPath));
    if (!details.isDirectory() || details.isSymbolicLink()) {
      throw createAgentOperationError(
        operation,
        "Could not safely inspect the GitHub Copilot CLI extension directory."
      );
    }
  } catch (error) {
    if (isAgentOperationError(error)) {
      throw error;
    }
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw createAgentOperationError(
      operation,
      "Could not safely inspect the GitHub Copilot CLI extension directory."
    );
  }
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

async function assertNoAlternativeEntryPoints(
  path: string,
  operation: AgentOperation = "install"
): Promise<void> {
  for (const name of ALTERNATIVE_ENTRY_NAMES) {
    try {
      await readBoundedUtf8File(join(dirname(path), name), MAX_EXTENSION_BYTES);
      throw createAgentOperationError(
        operation,
        "The GitHub Copilot CLI extension directory already contains another entry point."
      );
    } catch (error) {
      if (isAgentOperationError(error)) {
        throw error;
      }
      if (error instanceof BoundedFileError && error.code === "not-found") {
        continue;
      }
      throw createAgentOperationError(
        operation,
        "Could not safely inspect the GitHub Copilot CLI extension."
      );
    }
  }
}

async function readExistingExtension(
  path: string,
  operation: AgentOperation = "install"
): Promise<string | null> {
  try {
    return await readBoundedUtf8File(path, MAX_EXTENSION_BYTES);
  } catch (error) {
    if (error instanceof BoundedFileError) {
      if (error.code === "not-found") {
        return null;
      }
      if (error.code === "too-large") {
        throw createAgentOperationError(
          operation,
          operation === "uninstall"
            ? "The existing GitHub Copilot CLI extension is too large to remove safely."
            : "The existing GitHub Copilot CLI extension is too large to update safely."
        );
      }
    }
    throw createAgentOperationError(
      operation,
      "Could not safely read the GitHub Copilot CLI extension."
    );
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
