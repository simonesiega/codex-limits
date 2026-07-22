import {expect, test} from "bun:test";
import {lstat, mkdir, readFile, symlink, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {
  inspectPiIntegration as inspectPiPlugin,
  installPiIntegration as installPiPlugin,
} from "@/agents/pi/install";
import {withTempDirectory} from "@tests/helpers/temp-directory";

interface PiPaths {
  directory: string;
  settingsPath: string;
  packageRoot: string;
}

function withPiConfig(run: (paths: PiPaths) => Promise<void>): Promise<void> {
  return withTempDirectory("codex-limits-pi-", async (directory) => {
    const packageRoot = join(directory, "package");
    await mkdir(join(packageRoot, "dist"), {recursive: true});
    await Promise.all([
      writeFile(join(packageRoot, "dist", "pi.js"), "export default () => {};\n", "utf8"),
      writeFile(
        join(packageRoot, "package.json"),
        JSON.stringify({
          name: "@simonesiega/codex-limits",
          pi: {extensions: ["./dist/pi.js"]},
        }),
        "utf8"
      ),
    ]);
    await run({
      directory,
      settingsPath: join(directory, "agent", "settings.json"),
      packageRoot,
    });
  });
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

test("installPiPlugin registers the package while preserving pi settings", async () => {
  await withPiConfig(async ({settingsPath, packageRoot}) => {
    await mkdir(dirname(settingsPath), {recursive: true});
    await writeFile(
      settingsPath,
      JSON.stringify({theme: "dark", packages: ["npm:another-package"]}),
      "utf8"
    );

    const result = await installPiPlugin({settingsPath, packageRoot});
    expect(result).toEqual({changed: true, configPaths: [settingsPath]});
    expect(await readJson<{theme: string; packages: string[]}>(settingsPath)).toEqual({
      theme: "dark",
      packages: ["npm:another-package", packageRoot],
    });

    expect(await installPiPlugin({settingsPath, packageRoot})).toEqual({
      changed: false,
      configPaths: [settingsPath],
    });
    expect(await inspectPiPlugin({settingsPath, packageRoot})).toBe("installed");
  });
});

test("installPiPlugin creates missing global settings from PI_CODING_AGENT_DIR", async () => {
  await withPiConfig(async ({directory, packageRoot}) => {
    const agentDirectory = join(directory, "custom-agent");
    const settingsPath = join(agentDirectory, "settings.json");
    const result = await installPiPlugin({
      packageRoot,
      homeDirectory: directory,
      env: {PI_CODING_AGENT_DIR: agentDirectory},
    });

    expect(result).toEqual({changed: true, configPaths: [settingsPath]});
    expect(await readJson<{packages: string[]}>(settingsPath)).toEqual({
      packages: [packageRoot],
    });
  });
});

test("installPiPlugin recognizes pinned npm registration and enables its extension", async () => {
  await withPiConfig(async ({settingsPath, packageRoot}) => {
    await mkdir(dirname(settingsPath), {recursive: true});
    await writeFile(
      settingsPath,
      JSON.stringify({
        packages: [
          {
            source: "npm:@simonesiega/codex-limits@0.1.5",
            extensions: [],
            skills: [],
          },
        ],
      }),
      "utf8"
    );

    expect(await inspectPiPlugin({settingsPath, packageRoot})).toBe("not-installed");
    expect((await installPiPlugin({settingsPath, packageRoot})).changed).toBe(true);
    expect(
      await readJson<{
        packages: Array<{source: string; extensions: string[]; skills: string[]}>;
      }>(settingsPath)
    ).toEqual({
      packages: [
        {
          source: "npm:@simonesiega/codex-limits@0.1.5",
          extensions: ["+dist/pi.js"],
          skills: [],
        },
      ],
    });
    expect(await inspectPiPlugin({settingsPath, packageRoot})).toBe("installed");
  });
});

test("installPiPlugin enables an autoload delta without changing unrelated filters", async () => {
  await withPiConfig(async ({settingsPath, packageRoot}) => {
    await mkdir(dirname(settingsPath), {recursive: true});
    await writeFile(
      settingsPath,
      JSON.stringify({
        packages: [
          {
            source: "npm:@simonesiega/codex-limits",
            autoload: false,
            extensions: ["+dist/pi.js", "-dist/pi.js"],
            themes: ["legacy.json"],
          },
        ],
      }),
      "utf8"
    );

    expect(await inspectPiPlugin({settingsPath, packageRoot})).toBe("not-installed");
    expect((await installPiPlugin({settingsPath, packageRoot})).changed).toBe(true);
    expect(
      await readJson<{
        packages: Array<{
          source: string;
          autoload: boolean;
          extensions: string[];
          themes: string[];
        }>;
      }>(settingsPath)
    ).toEqual({
      packages: [
        {
          source: "npm:@simonesiega/codex-limits",
          autoload: false,
          extensions: ["-dist/pi.js", "+dist/pi.js"],
          themes: ["legacy.json"],
        },
      ],
    });
    expect(await inspectPiPlugin({settingsPath, packageRoot})).toBe("installed");
  });
});

test("installPiPlugin enables an autoload delta with no resource list", async () => {
  await withPiConfig(async ({settingsPath, packageRoot}) => {
    await mkdir(dirname(settingsPath), {recursive: true});
    await writeFile(
      settingsPath,
      JSON.stringify({
        packages: [
          {
            source: "npm:@simonesiega/codex-limits",
            autoload: false,
            skills: ["review"],
          },
        ],
      }),
      "utf8"
    );

    expect(await inspectPiPlugin({settingsPath, packageRoot})).toBe("not-installed");
    expect((await installPiPlugin({settingsPath, packageRoot})).changed).toBe(true);
    expect(
      await readJson<{
        packages: Array<{
          source: string;
          autoload: boolean;
          extensions: string[];
          skills: string[];
        }>;
      }>(settingsPath)
    ).toEqual({
      packages: [
        {
          source: "npm:@simonesiega/codex-limits",
          autoload: false,
          extensions: ["+dist/pi.js"],
          skills: ["review"],
        },
      ],
    });
  });
});

test("installPiPlugin preserves package filters that already enable its bundle", async () => {
  await withPiConfig(async ({settingsPath, packageRoot}) => {
    await mkdir(dirname(settingsPath), {recursive: true});
    for (const extensionFilter of ["dist/pi.js", "pi.js", "*.js", "**/pi.js"]) {
      const configured = {
        packages: [
          {
            source: "npm:@simonesiega/codex-limits",
            extensions: [extensionFilter],
          },
        ],
      };
      await writeFile(settingsPath, JSON.stringify(configured), "utf8");

      expect(await inspectPiPlugin({settingsPath, packageRoot}), extensionFilter).toBe("installed");
      expect((await installPiPlugin({settingsPath, packageRoot})).changed).toBe(false);
      expect(
        await readJson<{packages: Array<{source: string; extensions: string[]}>}>(settingsPath)
      ).toEqual(configured);
    }
  });
});

test("installPiPlugin force-enables only its extension when filters exclude it", async () => {
  await withPiConfig(async ({settingsPath, packageRoot}) => {
    await mkdir(dirname(settingsPath), {recursive: true});
    await writeFile(
      settingsPath,
      JSON.stringify({
        packages: [
          {
            source: "npm:@simonesiega/codex-limits",
            extensions: ["other/*.js", "!dist/*.js", "-./dist/pi.js"],
            themes: [],
          },
        ],
      }),
      "utf8"
    );

    expect(await inspectPiPlugin({settingsPath, packageRoot})).toBe("not-installed");
    expect((await installPiPlugin({settingsPath, packageRoot})).changed).toBe(true);
    expect(
      await readJson<{
        packages: Array<{source: string; extensions: string[]; themes: string[]}>;
      }>(settingsPath)
    ).toEqual({
      packages: [
        {
          source: "npm:@simonesiega/codex-limits",
          extensions: ["other/*.js", "!dist/*.js", "+dist/pi.js"],
          themes: [],
        },
      ],
    });
    expect(await inspectPiPlugin({settingsPath, packageRoot})).toBe("installed");
  });
});

test("installPiPlugin recognizes bare relative local package paths", async () => {
  await withPiConfig(async ({directory, packageRoot}) => {
    const settingsPath = join(directory, "settings.json");
    await writeFile(settingsPath, JSON.stringify({packages: ["package"]}), "utf8");

    expect(await inspectPiPlugin({settingsPath, packageRoot})).toBe("installed");
    expect((await installPiPlugin({settingsPath, packageRoot})).changed).toBe(false);
  });
});

test("installPiPlugin accepts an existing npm registration without a local bundle", async () => {
  await withPiConfig(async ({directory, settingsPath}) => {
    await mkdir(dirname(settingsPath), {recursive: true});
    await writeFile(
      settingsPath,
      JSON.stringify({packages: ["npm:@simonesiega/codex-limits@latest"]}),
      "utf8"
    );
    const missingPackage = join(directory, "missing-package");

    expect(await inspectPiPlugin({settingsPath, packageRoot: missingPackage})).toBe("installed");
    expect(await installPiPlugin({settingsPath, packageRoot: missingPackage})).toEqual({
      changed: false,
      configPaths: [settingsPath],
    });
  });
});

test("inspectPiPlugin reports absent and unsafe settings without exposing paths", async () => {
  await withPiConfig(async ({settingsPath, packageRoot}) => {
    expect(await inspectPiPlugin({settingsPath, packageRoot})).toBe("not-installed");

    await mkdir(dirname(settingsPath), {recursive: true});
    await writeFile(settingsPath, "{ private-invalid-json", "utf8");
    const status = await inspectPiPlugin({settingsPath, packageRoot});
    expect(status).toBe("unknown");
    expect(status).not.toContain(settingsPath);
  });
});

test("installPiPlugin safely rejects malformed and oversized settings", async () => {
  await withPiConfig(async ({settingsPath, packageRoot}) => {
    await mkdir(dirname(settingsPath), {recursive: true});

    await writeFile(settingsPath, "{ private-invalid-json", "utf8");
    await expect(installPiPlugin({settingsPath, packageRoot})).rejects.toThrow(
      "pi settings must contain valid JSON."
    );

    await writeFile(settingsPath, "[]", "utf8");
    await expect(installPiPlugin({settingsPath, packageRoot})).rejects.toThrow(
      "pi settings must be a JSON object."
    );

    await writeFile(settingsPath, JSON.stringify({packages: {source: "private"}}), "utf8");
    await expect(installPiPlugin({settingsPath, packageRoot})).rejects.toThrow(
      "pi settings field `packages` must contain package sources."
    );

    await writeFile(settingsPath, " ".repeat(1_000_001), "utf8");
    await expect(installPiPlugin({settingsPath, packageRoot})).rejects.toThrow(
      "Pi settings are too large to update safely."
    );
  });
});

test("installPiPlugin refuses an unavailable integration package", async () => {
  await withPiConfig(async ({directory, settingsPath, packageRoot}) => {
    const missingPackage = join(directory, "missing-package");
    await expect(installPiPlugin({settingsPath, packageRoot: missingPackage})).rejects.toThrow(
      "The pi integration bundle is unavailable."
    );
    expect(await inspectPiPlugin({settingsPath, packageRoot: missingPackage})).toBe(
      "not-installed"
    );

    await writeFile(
      join(packageRoot, "package.json"),
      JSON.stringify({name: "@simonesiega/codex-limits"}),
      "utf8"
    );
    await expect(installPiPlugin({settingsPath, packageRoot})).rejects.toThrow(
      "The pi integration bundle is unavailable."
    );
  });
});

if (process.platform !== "win32") {
  test("installPiPlugin refuses to replace symbolic-link settings", async () => {
    await withPiConfig(async ({directory, settingsPath, packageRoot}) => {
      const targetPath = join(directory, "private-settings.json");
      const targetSettings = JSON.stringify({packages: ["npm:another-package"]});
      await mkdir(dirname(settingsPath), {recursive: true});
      await writeFile(targetPath, targetSettings, "utf8");
      await symlink(targetPath, settingsPath, "file");

      await expect(installPiPlugin({settingsPath, packageRoot})).rejects.toThrow(
        "Could not safely read the pi settings."
      );
      expect(await readFile(targetPath, "utf8")).toBe(targetSettings);
      expect((await lstat(settingsPath)).isSymbolicLink()).toBe(true);
    });
  });
}
