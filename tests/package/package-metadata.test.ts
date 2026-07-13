import {expect, test} from "bun:test";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {PACKAGE_VERSION} from "@/package/version";

interface PackageMetadata {
  name: string;
  version: string;
  bin: Record<string, string>;
  exports: {".": {import: string; types: string}};
  files: string[];
  types: string;
  engines: {node: string};
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
}

async function readPackageMetadata(): Promise<PackageMetadata> {
  return JSON.parse(
    await readFile(resolve(import.meta.dir, "../../package.json"), "utf8")
  ) as PackageMetadata;
}

test("package metadata preserves the npm, binary, and root plugin contracts", async () => {
  const packageJson = await readPackageMetadata();

  expect(packageJson.name).toBe("@simonesiega/codex-limits");
  expect(packageJson.version).toBe(PACKAGE_VERSION);
  expect(packageJson.bin).toEqual({"codex-limits": "dist/cli.js"});
  expect(packageJson.exports).toEqual({
    ".": {types: "./types/index.d.ts", import: "./dist/index.js"},
  });
  expect(packageJson.types).toBe("./types/index.d.ts");
  expect(packageJson.engines.node).toBe(">=20");
});

test("generated declarations expose exactly the default plugin and named tui contract", async () => {
  const declaration = await readFile(resolve(import.meta.dir, "../../types/index.d.ts"), "utf8");

  expect(declaration).toContain('id: "codex-limits";');
  expect(declaration).toContain("export default plugin;");
  expect(declaration).toContain("export declare const tui:");
  expect(declaration).not.toContain("src/");
  expect(declaration).not.toContain("@opencode-ai/plugin");
});

test("package metadata includes runtime documentation and excludes bundled runtime dependencies", async () => {
  const packageJson = await readPackageMetadata();

  expect(packageJson.files).toContain("types");
  expect(packageJson.files).toContain("docs/photos");
  expect(packageJson.files).toContain("SECURITY.md");
  expect(packageJson.dependencies ?? {}).toEqual({});
});

test("validation and prepack scripts do not recurse", async () => {
  const packageJson = await readPackageMetadata();

  expect(packageJson.scripts.check).toContain("format:check");
  expect(packageJson.scripts.check).toContain("package:validate");
  expect(packageJson.scripts.prepack).toBe("bun run build");
  expect(packageJson.scripts.prepack).not.toContain("check");
});
