import {chmod, mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {format, resolveConfig} from "prettier";

const root = join(import.meta.dir, "..");
const distDirectory = join(root, "dist");
const typesBuildDirectory = join(root, ".types-build");
const typesDirectory = join(root, "types");

await Promise.all(
  [distDirectory, typesBuildDirectory, typesDirectory].map((directory) =>
    rm(directory, {recursive: true, force: true})
  )
);
await mkdir(distDirectory, {recursive: true});

const cliBundle = await Bun.build({
  entrypoints: [join(root, "src", "package", "cli.ts")],
  outdir: distDirectory,
  naming: {entry: "cli.js"},
  target: "node",
  format: "esm",
  minify: true,
  define: {"process.env.NODE_ENV": JSON.stringify("production")},
  sourcemap: "none",
  metafile: true,
});
if (!cliBundle.success) {
  for (const log of cliBundle.logs) {
    console.error(log);
  }
  throw new Error("CLI bundle failed.");
}

interface AgentBundleDefinition {
  id: "opencode" | "pi" | "copilot";
  displayName: string;
  output: string;
  external?: string[];
  define?: Record<string, string>;
}

const agentBundleDefinitions: readonly AgentBundleDefinition[] = [
  {id: "opencode", displayName: "OpenCode", output: "opencode.js"},
  {
    id: "pi",
    displayName: "pi",
    output: "pi.js",
    external: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui"],
  },
  {
    id: "copilot",
    displayName: "GitHub Copilot CLI",
    output: "copilot.mjs",
    external: ["@github/copilot-sdk/extension"],
    define: {__CODEX_LIMITS_COPILOT_EXTENSION__: "true"},
  },
];

const agentBundles = await Promise.all(
  agentBundleDefinitions.map(async (definition) => {
    const bundle = await Bun.build({
      entrypoints: [join(root, "src", "package", `${definition.id}.ts`)],
      outdir: distDirectory,
      naming: {entry: definition.output},
      target: "node",
      format: "esm",
      minify: true,
      external: definition.external ?? [],
      define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
        ...definition.define,
      },
      sourcemap: "none",
      metafile: true,
    });
    if (!bundle.success) {
      for (const log of bundle.logs) {
        console.error(log);
      }
      throw new Error(`${definition.displayName} extension bundle failed.`);
    }
    return bundle;
  })
);

await writeThirdPartyNotices([
  ...Object.keys(cliBundle.metafile.inputs),
  ...agentBundles.flatMap((bundle) => Object.keys(bundle.metafile.inputs)),
]);

try {
  const declarationBuild = Bun.spawn(
    ["bun", "x", "tsc", "--project", join(root, "tsconfig.types.json")],
    {cwd: root, stdout: "inherit", stderr: "inherit"}
  );
  const exitCode = await declarationBuild.exited;
  if (exitCode !== 0) {
    throw new Error(`Type declaration build exited with code ${exitCode}.`);
  }

  const declarations = agentBundleDefinitions.map(({id, displayName}) => ({
    source: `${id}.d.ts`,
    target: `${id}.d.ts`,
    label: displayName,
  }));
  const prettierConfig = (await resolveConfig(join(typesDirectory, "opencode.d.ts"))) ?? {};

  await mkdir(typesDirectory, {recursive: true});
  for (const declarationTarget of declarations) {
    const declaration = await readFile(
      join(typesBuildDirectory, "package", declarationTarget.source),
      "utf8"
    );
    if (
      /\bfrom\s+["']/.test(declaration) ||
      /\bimport\s*\(/.test(declaration) ||
      /src\//.test(declaration)
    ) {
      throw new Error(
        `Generated ${declarationTarget.label} declaration references a private source module.`
      );
    }

    const formattedDeclaration = await format(declaration, {
      ...prettierConfig,
      filepath: `types/${declarationTarget.target}`,
      parser: "typescript",
    });
    await writeFile(join(typesDirectory, declarationTarget.target), formattedDeclaration, "utf8");
  }
  await chmod(join(distDirectory, "cli.js"), 0o755);
} finally {
  await rm(typesBuildDirectory, {recursive: true, force: true});
}

interface BundledPackageMetadata {
  name?: unknown;
  version?: unknown;
  license?: unknown;
}

async function writeThirdPartyNotices(inputPaths: readonly string[]): Promise<void> {
  // These npm tarballs omit license files, so every reviewed fallback is version-pinned.
  const licenseFallbacks: Readonly<Record<string, {path: string; version: string}>> = {
    "react-devtools-core": {
      path: join(root, "scripts", "licenses", "react-devtools-core.txt"),
      version: "7.0.1",
    },
    "yoga-layout": {
      path: join(root, "scripts", "licenses", "yoga-layout.txt"),
      version: "3.2.1",
    },
  };
  const packageRoots = new Set<string>();
  for (const inputPath of inputPaths) {
    const packageRoot = findBundledPackageRoot(inputPath);
    if (packageRoot) {
      packageRoots.add(packageRoot);
    }
  }

  const sections: Array<{name: string; text: string}> = [];
  for (const packageRoot of packageRoots) {
    const metadata = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8")
    ) as BundledPackageMetadata;
    if (
      typeof metadata.name !== "string" ||
      typeof metadata.version !== "string" ||
      typeof metadata.license !== "string"
    ) {
      throw new Error(`Bundled dependency at ${packageRoot} has incomplete license metadata.`);
    }

    const licenseFiles = (await readdir(packageRoot, {withFileTypes: true}))
      .filter((entry) => entry.isFile() && /^(?:licen[cs]e|copying|notice)/i.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const licensePaths = licenseFiles.map((file) => join(packageRoot, file));
    if (licensePaths.length === 0) {
      const fallback = licenseFallbacks[metadata.name];
      if (!fallback || fallback.version !== metadata.version) {
        throw new Error(
          `Bundled dependency ${metadata.name}@${metadata.version} needs a reviewed license text.`
        );
      }
      licensePaths.push(fallback.path);
    }

    const licenseTexts = await Promise.all(
      licensePaths.map(async (path) => (await readFile(path, "utf8")).trim())
    );
    sections.push({
      name: `${metadata.name}@${metadata.version}`,
      text: [
        `Package: ${metadata.name}@${metadata.version}`,
        `License: ${metadata.license}`,
        "",
        licenseTexts.join("\n\n"),
      ].join("\n"),
    });
  }

  sections.sort((left, right) => (left.name === right.name ? 0 : left.name < right.name ? -1 : 1));
  const notices = [
    "THIRD-PARTY SOFTWARE NOTICES",
    "",
    "codex-limits bundles the following third-party software. The applicable license",
    "texts are reproduced below.",
    "",
    sections.map((section) => section.text).join("\n\n---\n\n"),
    "",
  ].join("\n");
  await writeFile(join(distDirectory, "THIRD_PARTY_NOTICES.txt"), notices, "utf8");
}

function findBundledPackageRoot(inputPath: string): string | null {
  const normalizedPath = inputPath.replaceAll("\\", "/");
  const nodeModulesMarker = "node_modules/";
  const markerIndex = normalizedPath.lastIndexOf(nodeModulesMarker);
  if (markerIndex < 0) {
    return null;
  }

  const packagePath = normalizedPath.slice(markerIndex + nodeModulesMarker.length);
  const pathSegments = packagePath.split("/");
  const packageSegmentCount = pathSegments[0]?.startsWith("@") ? 2 : 1;
  if (pathSegments.length < packageSegmentCount) {
    throw new Error(`Could not identify bundled dependency path ${inputPath}.`);
  }

  return `${normalizedPath.slice(0, markerIndex + nodeModulesMarker.length)}${pathSegments
    .slice(0, packageSegmentCount)
    .join("/")}`;
}
