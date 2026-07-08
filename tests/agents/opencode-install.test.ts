import {expect, test} from "bun:test";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {installOpencodePlugin} from "../../src/agents/opencode/install";

test("installOpencodePlugin creates global plugin config", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-limits-opencode-install-"));
  const configPath = join(home, "opencode.json");
  const tuiConfigPath = join(home, "tui.json");

  try {
    const result = await installOpencodePlugin({configPath, tuiConfigPath});
    const config = JSON.parse(await readFile(configPath, "utf8")) as {plugin: string[]};
    const tuiConfig = JSON.parse(await readFile(tuiConfigPath, "utf8")) as {plugin: string[]};

    expect(result.changed).toBe(true);
    expect(result.configPaths).toEqual([configPath, tuiConfigPath]);
    expect(config.plugin).toContain("@simonesiega/codex-limits");
    expect(tuiConfig.plugin).toContain("@simonesiega/codex-limits");
  } finally {
    await rm(home, {recursive: true, force: true});
  }
});

test("installOpencodePlugin rejects invalid plugin config", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-limits-opencode-invalid-"));
  const configPath = join(home, "opencode.json");
  const tuiConfigPath = join(home, "tui.json");

  try {
    await writeFile(configPath, JSON.stringify({plugin: "@simonesiega/codex-limits"}), "utf8");

    await expect(installOpencodePlugin({configPath, tuiConfigPath})).rejects.toThrow(
      "opencode config field `plugin` must be an array."
    );
  } finally {
    await rm(home, {recursive: true, force: true});
  }
});

test("installOpencodePlugin does not duplicate tuple plugin config", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-limits-opencode-tuple-"));
  const configPath = join(home, "opencode.json");
  const tuiConfigPath = join(home, "tui.json");
  const plugin = [["@simonesiega/codex-limits", {}]];

  try {
    await writeFile(configPath, JSON.stringify({plugin}), "utf8");
    await writeFile(tuiConfigPath, JSON.stringify({plugin}), "utf8");

    const result = await installOpencodePlugin({configPath, tuiConfigPath});
    const config = JSON.parse(await readFile(configPath, "utf8")) as {plugin: unknown[]};
    const tuiConfig = JSON.parse(await readFile(tuiConfigPath, "utf8")) as {plugin: unknown[]};

    expect(result.changed).toBe(false);
    expect(config.plugin).toEqual(plugin);
    expect(tuiConfig.plugin).toEqual(plugin);
  } finally {
    await rm(home, {recursive: true, force: true});
  }
});

test("installOpencodePlugin changes when one config is missing", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-limits-opencode-partial-"));
  const configPath = join(home, "opencode.json");
  const tuiConfigPath = join(home, "tui.json");

  try {
    await writeFile(configPath, JSON.stringify({plugin: ["@simonesiega/codex-limits"]}), "utf8");

    const result = await installOpencodePlugin({configPath, tuiConfigPath});
    const config = JSON.parse(await readFile(configPath, "utf8")) as {plugin: string[]};
    const tuiConfig = JSON.parse(await readFile(tuiConfigPath, "utf8")) as {plugin: string[]};

    expect(result.changed).toBe(true);
    expect(config.plugin).toEqual(["@simonesiega/codex-limits"]);
    expect(tuiConfig.plugin).toEqual(["@simonesiega/codex-limits"]);
  } finally {
    await rm(home, {recursive: true, force: true});
  }
});

test("installOpencodePlugin preserves existing config and avoids duplicates", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-limits-opencode-existing-"));
  const configPath = join(home, "opencode.json");
  const tuiConfigPath = join(home, "tui.json");

  try {
    await writeFile(
      configPath,
      JSON.stringify({model: "anthropic/test", plugin: ["@simonesiega/codex-limits"]}),
      "utf8"
    );
    await writeFile(
      tuiConfigPath,
      JSON.stringify({theme: "opencode", plugin: ["@simonesiega/codex-limits"]}),
      "utf8"
    );

    const result = await installOpencodePlugin({configPath, tuiConfigPath});
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      model: string;
      plugin: string[];
    };
    const tuiConfig = JSON.parse(await readFile(tuiConfigPath, "utf8")) as {
      theme: string;
      plugin: string[];
    };

    expect(result.changed).toBe(false);
    expect(config.model).toBe("anthropic/test");
    expect(config.plugin).toEqual(["@simonesiega/codex-limits"]);
    expect(tuiConfig.theme).toBe("opencode");
    expect(tuiConfig.plugin).toEqual(["@simonesiega/codex-limits"]);
  } finally {
    await rm(home, {recursive: true, force: true});
  }
});
