import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("package metadata publishes types for the root plugin export", async () => {
  const packageJson = JSON.parse(await readFile(resolve(import.meta.dir, "../../package.json"), "utf8")) as {
    exports: { ".": { import: string; types: string } };
    files: string[];
    types: string;
  };

  expect(packageJson.exports["."].import).toBe("./dist/index.js");
  expect(packageJson.exports["."].types).toBe("./types/index.d.ts");
  expect(packageJson.types).toBe("./types/index.d.ts");
  expect(packageJson.files).toContain("types");
});

test("package metadata includes README image assets", async () => {
  const packageJson = JSON.parse(await readFile(resolve(import.meta.dir, "../../package.json"), "utf8")) as {
    files: string[];
  };

  expect(packageJson.files).toContain("docs/photos");
});
