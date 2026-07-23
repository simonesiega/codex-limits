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
  keywords: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, {optional?: boolean}>;
  devDependencies: Record<string, string>;
  pi?: {extensions?: string[]};
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
    ".": {types: "./types/index.d.ts", import: "./dist/opencode.js"},
  });
  expect(packageJson.types).toBe("./types/index.d.ts");
  expect(packageJson.engines.node).toBe(">=20");
  expect(packageJson.pi).toEqual({extensions: ["./dist/pi.js"]});
  expect(packageJson.keywords).toContain("pi-package");
  expect(packageJson.keywords).toContain("github-copilot-cli");
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
  expect(packageJson.peerDependencies).toEqual({
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
  });
  expect(packageJson.peerDependenciesMeta).toEqual({
    "@earendil-works/pi-coding-agent": {optional: true},
    "@earendil-works/pi-tui": {optional: true},
  });
});

test("agent host dependencies preserve the published runtime contracts", async () => {
  const packageJson = await readPackageMetadata();

  expect(packageJson.devDependencies.ink).toBe("^6.8.0");
  expect(packageJson.devDependencies["react-devtools-core"]).toBe("^7.0.1");
  expect(packageJson.devDependencies["@earendil-works/pi-coding-agent"]).toBe("^0.81.1");
  expect(packageJson.devDependencies["@earendil-works/pi-tui"]).toBe("^0.81.1");
  expect(packageJson.devDependencies["@github/copilot-sdk"]).toBe("^1.0.8");
});

test("validation and prepack scripts do not recurse", async () => {
  const packageJson = await readPackageMetadata();

  expect(packageJson.scripts["docs:link"]).toBe("bun run scripts/check-doc-links.ts");
  expect(packageJson.scripts["docs:schema"]).toBe("bun run scripts/check-doc-schema.ts");
  expect(packageJson.scripts["docs:check"]).toBe("bun run docs:link && bun run docs:schema");
  expect(packageJson.scripts.check).toContain("format:check");
  expect(packageJson.scripts.check).toContain("docs:check");
  expect(packageJson.scripts.check).toContain("package:validate");
  expect(packageJson.scripts.prepack).toBe("bun run build");
  expect(packageJson.scripts.prepack).not.toContain("check");
});
