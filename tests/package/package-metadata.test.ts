import {expect, test} from "bun:test";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {AGENT_INTEGRATIONS} from "@/agents";
import {PACKAGE_VERSION} from "@/package/version";

interface PackageMetadata {
  name: string;
  version: string;
  bin: Record<string, string>;
  exports: Record<"." | "./opencode" | "./pi" | "./copilot", {import: string; types: string}>;
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

test("package metadata preserves the CLI and agent-host module contracts", async () => {
  const packageJson = await readPackageMetadata();

  expect(packageJson.name).toBe("@simonesiega/codex-limits");
  expect(packageJson.version).toBe(PACKAGE_VERSION);
  expect(packageJson.bin).toEqual({"codex-limits": "dist/cli.js"});
  expect(packageJson.exports).toEqual({
    ".": {types: "./types/opencode.d.ts", import: "./dist/opencode.js"},
    "./opencode": {types: "./types/opencode.d.ts", import: "./dist/opencode.js"},
    "./pi": {types: "./types/pi.d.ts", import: "./dist/pi.js"},
    "./copilot": {types: "./types/copilot.d.ts", import: "./dist/copilot.mjs"},
  });
  expect(
    Object.keys(packageJson.exports)
      .filter((subpath) => subpath !== ".")
      .sort()
  ).toEqual(AGENT_INTEGRATIONS.map((integration) => `./${integration.id}`).sort());
  expect(packageJson.types).toBe("./types/opencode.d.ts");
  expect(packageJson.engines.node).toBe(">=20");
  expect(packageJson.pi).toEqual({extensions: ["./dist/pi.js"]});
  expect(packageJson.keywords).toContain("pi-package");
  expect(packageJson.keywords).toContain("github-copilot-cli");
});

test("generated declarations expose only the agent-host contracts", async () => {
  const [opencodeDeclaration, piDeclaration, copilotDeclaration] = await Promise.all([
    readFile(resolve(import.meta.dir, "../../types/opencode.d.ts"), "utf8"),
    readFile(resolve(import.meta.dir, "../../types/pi.d.ts"), "utf8"),
    readFile(resolve(import.meta.dir, "../../types/copilot.d.ts"), "utf8"),
  ]);

  expect(opencodeDeclaration).toContain("export interface CodexLimitsTuiPluginModule");
  expect(opencodeDeclaration).toContain(
    "export type CodexLimitsOpencodeExtension = CodexLimitsTuiPluginModule"
  );
  expect(opencodeDeclaration).toContain('id: "codex-limits";');
  expect(opencodeDeclaration).toContain("export default plugin;");
  expect(opencodeDeclaration).toContain("export declare const tui:");
  expect(opencodeDeclaration).not.toContain("src/");
  expect(opencodeDeclaration).not.toContain("@opencode-ai/plugin");

  expect(piDeclaration).toContain("export type CodexLimitsPiExtension");
  expect(piDeclaration).toContain("export default plugin;");
  expect(piDeclaration).not.toContain("src/");
  expect(piDeclaration).not.toContain("@earendil-works/pi-coding-agent");

  expect(copilotDeclaration).toContain("export type CodexLimitsCopilotExtension");
  expect(copilotDeclaration).toContain("export declare const startCopilotExtension:");
  expect(copilotDeclaration).toContain("export default plugin;");
  expect(copilotDeclaration).not.toContain("src/");
  expect(copilotDeclaration).not.toContain("@github/copilot-sdk");
});

test("package metadata includes runtime documentation and excludes bundled runtime dependencies", async () => {
  const packageJson = await readPackageMetadata();

  expect(packageJson.files).toContain("types");
  expect(packageJson.files).toContain("docs");
  expect(packageJson.files).toContain("CONTRIBUTING.md");
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

test("manual publishing requires the matching version tag", async () => {
  const workflow = await readFile(
    resolve(import.meta.dir, "../../.github/workflows/publish.yml"),
    "utf8"
  );

  expect(workflow).toContain('if [ "$REF_TYPE" != "tag" ]; then');
  expect(workflow).toContain('PUBLISH_TAG="$REF_NAME"');
  expect(workflow).toContain('if [ "$PUBLISH_TAG" != "v$PACKAGE_VERSION" ]; then');
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
