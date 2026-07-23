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

const opencodeBundle = await Bun.build({
  entrypoints: [join(root, "src", "package", "index.ts")],
  outdir: distDirectory,
  naming: {entry: "opencode.js"},
  target: "node",
  format: "esm",
  minify: true,
  define: {"process.env.NODE_ENV": JSON.stringify("production")},
  sourcemap: "none",
  metafile: true,
});
if (!opencodeBundle.success) {
  for (const log of opencodeBundle.logs) {
    console.error(log);
  }
  throw new Error("OpenCode extension bundle failed.");
}

const piBundle = await Bun.build({
  entrypoints: [join(root, "src", "agents", "pi", "plugin.ts")],
  outdir: distDirectory,
  naming: {entry: "pi.js"},
  target: "node",
  format: "esm",
  minify: true,
  external: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui"],
  define: {"process.env.NODE_ENV": JSON.stringify("production")},
  sourcemap: "none",
  metafile: true,
});
if (!piBundle.success) {
  for (const log of piBundle.logs) {
    console.error(log);
  }
  throw new Error("Pi extension bundle failed.");
}

const copilotBundle = await Bun.build({
  entrypoints: [join(root, "src", "agents", "copilot", "plugin.ts")],
  outdir: distDirectory,
  naming: {entry: "copilot.mjs"},
  target: "node",
  format: "esm",
  minify: true,
  external: ["@github/copilot-sdk/extension"],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __CODEX_LIMITS_COPILOT_EXTENSION__: "true",
  },
  sourcemap: "none",
  metafile: true,
});
if (!copilotBundle.success) {
  for (const log of copilotBundle.logs) {
    console.error(log);
  }
  throw new Error("GitHub Copilot CLI extension bundle failed.");
}

await writeThirdPartyNotices([
  ...Object.keys(cliBundle.metafile.inputs),
  ...Object.keys(opencodeBundle.metafile.inputs),
  ...Object.keys(piBundle.metafile.inputs),
  ...Object.keys(copilotBundle.metafile.inputs),
]);

try {
  const declarations = Bun.spawn(
    ["bun", "x", "tsc", "--project", join(root, "tsconfig.types.json")],
    {cwd: root, stdout: "inherit", stderr: "inherit"}
  );
  const exitCode = await declarations.exited;
  if (exitCode !== 0) {
    throw new Error(`Type declaration build exited with code ${exitCode}.`);
  }

  const declarationPath = join(typesBuildDirectory, "package", "index.d.ts");
  const declaration = await readFile(declarationPath, "utf8");
  if (
    /\bfrom\s+["']/.test(declaration) ||
    /\bimport\s*\(/.test(declaration) ||
    /src\//.test(declaration)
  ) {
    throw new Error("Generated root declaration references a private source module.");
  }

  const prettierConfig = (await resolveConfig(join(typesDirectory, "index.d.ts"))) ?? {};
  const formattedDeclaration = await format(declaration, {
    ...prettierConfig,
    filepath: "types/index.d.ts",
    parser: "typescript",
  });

  await mkdir(typesDirectory, {recursive: true});
  await writeFile(join(typesDirectory, "index.d.ts"), formattedDeclaration, "utf8");
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
