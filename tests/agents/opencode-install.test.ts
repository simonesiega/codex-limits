import {expect, test} from "bun:test";
import {lstat, readFile, symlink, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {inspectOpencodePlugin, installOpencodePlugin} from "@/agents/opencode/install";
import {withTempDirectory} from "@tests/helpers/temp-directory";

interface ConfigPaths {
  directory: string;
  configPath: string;
  tuiConfigPath: string;
}

function withOpencodeConfigs(run: (paths: ConfigPaths) => Promise<void>): Promise<void> {
  return withTempDirectory("codex-limits-opencode-", (directory) =>
    run({
      directory,
      configPath: join(directory, "opencode.json"),
      tuiConfigPath: join(directory, "tui.json"),
    })
  );
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

test("inspectOpencodePlugin reports installed, absent, and unknown configurations safely", async () => {
  await withOpencodeConfigs(async ({configPath, tuiConfigPath}) => {
    expect(await inspectOpencodePlugin({configPath, tuiConfigPath})).toBe("not-installed");

    await writeFile(
      configPath,
      JSON.stringify({plugin: ["@simonesiega/codex-limits@0.1.5"]}),
      "utf8"
    );
    await writeFile(tuiConfigPath, "{ private-invalid-json", "utf8");
    expect(await inspectOpencodePlugin({configPath, tuiConfigPath})).toBe("installed");

    await writeFile(configPath, JSON.stringify({plugin: ["another-plugin"]}), "utf8");
    expect(await inspectOpencodePlugin({configPath, tuiConfigPath})).toBe("unknown");
  });
});

test("installOpencodePlugin creates global plugin config", async () => {
  await withOpencodeConfigs(async ({configPath, tuiConfigPath}) => {
    const result = await installOpencodePlugin({configPath, tuiConfigPath});
    const config = await readJson<{$schema: string; plugin: string[]}>(configPath);
    const tuiConfig = await readJson<{$schema: string; plugin: string[]}>(tuiConfigPath);

    expect(result.changed).toBe(true);
    expect(result.configPaths).toEqual([configPath, tuiConfigPath]);
    expect(config).toEqual({
      $schema: "https://opencode.ai/config.json",
      plugin: ["@simonesiega/codex-limits"],
    });
    expect(tuiConfig).toEqual({
      $schema: "https://opencode.ai/tui.json",
      plugin: ["@simonesiega/codex-limits"],
    });
  });
});

test("installOpencodePlugin rejects invalid plugin config", async () => {
  await withOpencodeConfigs(async ({configPath, tuiConfigPath}) => {
    await writeFile(configPath, JSON.stringify({plugin: "@simonesiega/codex-limits"}), "utf8");

    await expect(installOpencodePlugin({configPath, tuiConfigPath})).rejects.toThrow(
      "opencode config field `plugin` must be an array."
    );
  });
});

test("installOpencodePlugin reports safe malformed and oversized config errors", async () => {
  await withOpencodeConfigs(async ({directory, configPath, tuiConfigPath}) => {
    await writeFile(configPath, "{ private-invalid-json", "utf8");
    await expect(installOpencodePlugin({configPath, tuiConfigPath})).rejects.toThrow(
      "opencode config must contain valid JSON."
    );

    await writeFile(configPath, " ".repeat(1_000_001), "utf8");
    await expect(installOpencodePlugin({configPath, tuiConfigPath})).rejects.toThrow(
      "OpenCode configuration is too large to update safely."
    );

    await writeFile(configPath, "[]", "utf8");
    await expect(installOpencodePlugin({configPath, tuiConfigPath})).rejects.toThrow(
      "opencode config must be a JSON object."
    );

    await expect(installOpencodePlugin({configPath: directory, tuiConfigPath})).rejects.toThrow(
      "Could not safely read the OpenCode configuration."
    );
  });
});

if (process.platform !== "win32") {
  test("installOpencodePlugin refuses to replace a symbolic-link config", async () => {
    await withOpencodeConfigs(async ({directory, configPath, tuiConfigPath}) => {
      const targetPath = join(directory, "private.json");
      const targetConfig = JSON.stringify({plugin: ["another-plugin"]});
      await writeFile(targetPath, targetConfig, "utf8");
      await symlink(targetPath, configPath, "file");

      await expect(installOpencodePlugin({configPath, tuiConfigPath})).rejects.toThrow(
        "Could not safely read the OpenCode configuration."
      );
      expect(await readFile(targetPath, "utf8")).toBe(targetConfig);
      expect((await lstat(configPath)).isSymbolicLink()).toBe(true);
    });
  });
}

test("installOpencodePlugin preserves a version-pinned tuple plugin", async () => {
  await withOpencodeConfigs(async ({configPath, tuiConfigPath}) => {
    const plugin = [["@simonesiega/codex-limits@0.1.3", {}]];
    await writeFile(configPath, JSON.stringify({plugin}), "utf8");
    await writeFile(tuiConfigPath, JSON.stringify({plugin}), "utf8");

    const result = await installOpencodePlugin({configPath, tuiConfigPath});
    expect(result.changed).toBe(false);
    expect((await readJson<{plugin: unknown[]}>(configPath)).plugin).toEqual(plugin);
    expect((await readJson<{plugin: unknown[]}>(tuiConfigPath)).plugin).toEqual(plugin);
  });
});

test("installOpencodePlugin changes when one config is missing", async () => {
  await withOpencodeConfigs(async ({configPath, tuiConfigPath}) => {
    await writeFile(configPath, JSON.stringify({plugin: ["@simonesiega/codex-limits"]}), "utf8");

    const result = await installOpencodePlugin({configPath, tuiConfigPath});
    expect(result.changed).toBe(true);
    expect((await readJson<{plugin: string[]}>(configPath)).plugin).toEqual([
      "@simonesiega/codex-limits",
    ]);
    expect((await readJson<{plugin: string[]}>(tuiConfigPath)).plugin).toEqual([
      "@simonesiega/codex-limits",
    ]);
  });
});

test("installOpencodePlugin preserves existing config while adding the plugin", async () => {
  await withOpencodeConfigs(async ({configPath, tuiConfigPath}) => {
    await writeFile(
      configPath,
      JSON.stringify({model: "anthropic/test", plugin: ["another-plugin"]}),
      "utf8"
    );
    await writeFile(tuiConfigPath, JSON.stringify({theme: "opencode"}), "utf8");

    const result = await installOpencodePlugin({configPath, tuiConfigPath});
    expect(result.changed).toBe(true);
    expect(await readJson<{$schema: string; model: string; plugin: string[]}>(configPath)).toEqual({
      $schema: "https://opencode.ai/config.json",
      model: "anthropic/test",
      plugin: ["another-plugin", "@simonesiega/codex-limits"],
    });
    expect(
      await readJson<{$schema: string; theme: string; plugin: string[]}>(tuiConfigPath)
    ).toEqual({
      $schema: "https://opencode.ai/tui.json",
      theme: "opencode",
      plugin: ["@simonesiega/codex-limits"],
    });
  });
});

test("installOpencodePlugin preserves existing config and avoids duplicates", async () => {
  await withOpencodeConfigs(async ({configPath, tuiConfigPath}) => {
    const config = {model: "anthropic/test", plugin: ["@simonesiega/codex-limits"]};
    const tuiConfig = {theme: "opencode", plugin: ["@simonesiega/codex-limits"]};
    await writeFile(configPath, JSON.stringify(config), "utf8");
    await writeFile(tuiConfigPath, JSON.stringify(tuiConfig), "utf8");

    const result = await installOpencodePlugin({configPath, tuiConfigPath});
    expect(result.changed).toBe(false);
    expect(await readJson<typeof config>(configPath)).toEqual(config);
    expect(await readJson<typeof tuiConfig>(tuiConfigPath)).toEqual(tuiConfig);
  });
});
