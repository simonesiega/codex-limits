import {expect, test} from "bun:test";
import {lstat, mkdir, readFile, symlink, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {inspectCopilotIntegration, installCopilotIntegration} from "@/agents/copilot/install";
import {withTempDirectory} from "@tests/helpers/temp-directory";

const EXTENSION_MARKER = "codex-limits-copilot-extension-v1";
const BUNDLE = [
  'import {joinSession} from "@github/copilot-sdk/extension";',
  `export const marker = "${EXTENSION_MARKER}";`,
  "await joinSession({commands: []});",
  "",
].join("\n");

interface CopilotPaths {
  directory: string;
  extensionPath: string;
  packageRoot: string;
}

function withCopilotConfig(run: (paths: CopilotPaths) => Promise<void>): Promise<void> {
  return withTempDirectory("codex-limits-copilot-", async (directory) => {
    const packageRoot = join(directory, "package");
    await mkdir(join(packageRoot, "dist"), {recursive: true});
    await Promise.all([
      writeFile(join(packageRoot, "dist", "copilot.mjs"), BUNDLE, "utf8"),
      writeFile(
        join(packageRoot, "package.json"),
        JSON.stringify({name: "@simonesiega/codex-limits"}),
        "utf8"
      ),
    ]);
    await run({
      directory,
      extensionPath: join(directory, ".copilot", "extensions", "codex-limits", "extension.mjs"),
      packageRoot,
    });
  });
}

test("installCopilotIntegration installs the bundled user extension idempotently", async () => {
  await withCopilotConfig(async ({extensionPath, packageRoot}) => {
    expect(await inspectCopilotIntegration({extensionPath})).toBe("not-installed");

    expect(await installCopilotIntegration({extensionPath, packageRoot})).toEqual({
      changed: true,
      configPaths: [extensionPath],
    });
    expect(await readFile(extensionPath, "utf8")).toBe(BUNDLE);
    expect(await inspectCopilotIntegration({extensionPath})).toBe("installed");

    expect(await installCopilotIntegration({extensionPath, packageRoot})).toEqual({
      changed: false,
      configPaths: [extensionPath],
    });
  });
});

test("installCopilotIntegration uses the default home and honors COPILOT_HOME", async () => {
  await withCopilotConfig(async ({directory, packageRoot}) => {
    const cases = [
      {env: {}, copilotHome: join(directory, ".copilot")},
      {
        env: {COPILOT_HOME: join(directory, "custom-copilot-home")},
        copilotHome: join(directory, "custom-copilot-home"),
      },
    ];

    for (const item of cases) {
      const extensionPath = join(item.copilotHome, "extensions", "codex-limits", "extension.mjs");
      const result = await installCopilotIntegration({
        packageRoot,
        homeDirectory: directory,
        env: item.env,
      });

      expect(result).toEqual({changed: true, configPaths: [extensionPath]});
      expect(await readFile(extensionPath, "utf8")).toBe(BUNDLE);
    }
  });
});

test("installCopilotIntegration upgrades only a managed extension file", async () => {
  await withCopilotConfig(async ({extensionPath, packageRoot}) => {
    const siblingPath = join(dirname(extensionPath), "notes.txt");
    await mkdir(dirname(extensionPath), {recursive: true});
    await Promise.all([
      writeFile(extensionPath, `export const marker = "${EXTENSION_MARKER}";\n`, "utf8"),
      writeFile(siblingPath, "keep this file", "utf8"),
    ]);

    expect((await installCopilotIntegration({extensionPath, packageRoot})).changed).toBe(true);
    expect(await readFile(extensionPath, "utf8")).toBe(BUNDLE);
    expect(await readFile(siblingPath, "utf8")).toBe("keep this file");
  });
});

test("installCopilotIntegration refuses to overwrite another extension", async () => {
  await withCopilotConfig(async ({extensionPath, packageRoot}) => {
    const existing = "export const privateExtension = true;\n";
    await mkdir(dirname(extensionPath), {recursive: true});
    await writeFile(extensionPath, existing, "utf8");

    expect(await inspectCopilotIntegration({extensionPath})).toBe("not-installed");
    await expect(installCopilotIntegration({extensionPath, packageRoot})).rejects.toThrow(
      "The GitHub Copilot CLI extension path is already in use."
    );
    expect(await readFile(extensionPath, "utf8")).toBe(existing);
  });
});

test("installCopilotIntegration refuses a competing extension entry point", async () => {
  await withCopilotConfig(async ({extensionPath, packageRoot}) => {
    const competingPath = join(dirname(extensionPath), "extension.cjs");
    const existing = "module.exports = {};\n";
    await mkdir(dirname(extensionPath), {recursive: true});
    await writeFile(competingPath, existing, "utf8");

    await expect(installCopilotIntegration({extensionPath, packageRoot})).rejects.toThrow(
      "The GitHub Copilot CLI extension directory already contains another entry point."
    );
    expect(await readFile(competingPath, "utf8")).toBe(existing);
    expect(await inspectCopilotIntegration({extensionPath})).toBe("not-installed");
  });
});

test("installCopilotIntegration rejects unavailable bundles and oversized targets", async () => {
  await withCopilotConfig(async ({extensionPath, packageRoot}) => {
    await writeFile(join(packageRoot, "dist", "copilot.mjs"), "export {};\n", "utf8");
    await expect(installCopilotIntegration({extensionPath, packageRoot})).rejects.toThrow(
      "The GitHub Copilot CLI extension bundle is unavailable."
    );

    await writeFile(join(packageRoot, "dist", "copilot.mjs"), BUNDLE, "utf8");
    await mkdir(dirname(extensionPath), {recursive: true});
    await writeFile(extensionPath, " ".repeat(5_000_001), "utf8");
    await expect(installCopilotIntegration({extensionPath, packageRoot})).rejects.toThrow(
      "The existing GitHub Copilot CLI extension is too large to update safely."
    );
    expect(await inspectCopilotIntegration({extensionPath})).toBe("unknown");
  });
});

if (process.platform !== "win32") {
  test("installCopilotIntegration refuses to replace a symbolic-link entry", async () => {
    await withCopilotConfig(async ({directory, extensionPath, packageRoot}) => {
      const targetPath = join(directory, "private-extension.mjs");
      const targetContent = `export const marker = "${EXTENSION_MARKER}";\n`;
      await mkdir(dirname(extensionPath), {recursive: true});
      await writeFile(targetPath, targetContent, "utf8");
      await symlink(targetPath, extensionPath, "file");

      await expect(installCopilotIntegration({extensionPath, packageRoot})).rejects.toThrow(
        "Could not safely read the GitHub Copilot CLI extension."
      );
      expect(await readFile(targetPath, "utf8")).toBe(targetContent);
      expect((await lstat(extensionPath)).isSymbolicLink()).toBe(true);
      expect(await inspectCopilotIntegration({extensionPath})).toBe("unknown");
    });
  });
}
