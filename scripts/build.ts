import {chmod, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {format, resolveConfig} from "prettier";

const root = join(import.meta.dir, "..");
const distDirectory = join(root, "dist");
const typesBuildDirectory = join(root, ".types-build");
const typesDirectory = join(root, "types");

// Build the production bundle and generate type declarations.
await Promise.all([
  rm(distDirectory, {recursive: true, force: true}),
  rm(typesBuildDirectory, {recursive: true, force: true}),
]);
await mkdir(distDirectory, {recursive: true});

// Build the production bundle.
await runBuild({
  entrypoints: [join(root, "src", "package", "cli.ts"), join(root, "src", "package", "index.ts")],
  outdir: distDirectory,
  naming: {entry: "[name].js"},
});

// Generate type declarations.
await run(["bun", "x", "tsc", "--project", join(root, "tsconfig.types.json")]);
const declarationPath = join(typesBuildDirectory, "package", "index.d.ts");
const declaration = await readFile(declarationPath, "utf8");
if (/\bfrom\s+["']/.test(declaration) || /src\//.test(declaration)) {
  throw new Error("Generated root declaration unexpectedly references a private source module.");
}
const prettierConfig = (await resolveConfig(declarationPath)) ?? {};
const formattedDeclaration = await format(declaration, {
  ...prettierConfig,
  filepath: "types/index.d.ts",
  parser: "typescript",
});

// Write the formatted declaration to the types directory and clean up.
await mkdir(typesDirectory, {recursive: true});
await writeFile(join(typesDirectory, "index.d.ts"), formattedDeclaration, "utf8");
await chmod(join(distDirectory, "cli.js"), 0o755);
await rm(typesBuildDirectory, {recursive: true, force: true});

/**
 * Runs a build with Bun.build and throw an error if it fails.
 * @param options - The options for the build.
 */
async function runBuild(options: Parameters<typeof Bun.build>[0]): Promise<void> {
  const result = await Bun.build({
    target: "node",
    format: "esm",
    minify: true,
    define: {"process.env.NODE_ENV": JSON.stringify("production")},
    sourcemap: "none",
    ...options,
  });
  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    throw new Error("Production bundle failed.");
  }
}

/**
 * Runs a command with Bun.spawn and throw an error if it fails.
 * @param command - The command to run.
 */
async function run(command: string[]): Promise<void> {
  const child = Bun.spawn(command, {cwd: root, stdout: "inherit", stderr: "inherit"});
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${command[0]} exited with code ${exitCode}.`);
  }
}
