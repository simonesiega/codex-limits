import {chmod, mkdir, readFile, rm, writeFile} from "node:fs/promises";
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

const bundle = await Bun.build({
  entrypoints: [join(root, "src", "package", "cli.ts"), join(root, "src", "package", "index.ts")],
  outdir: distDirectory,
  naming: {entry: "[name].js"},
  target: "node",
  format: "esm",
  minify: true,
  define: {"process.env.NODE_ENV": JSON.stringify("production")},
  sourcemap: "none",
});
if (!bundle.success) {
  for (const log of bundle.logs) {
    console.error(log);
  }
  throw new Error("Production bundle failed.");
}

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
