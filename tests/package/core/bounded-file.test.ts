/**
 * @fileoverview Behavioral coverage for bounded file. The cases document the supported contract and isolate filesystem, network, or host state where applicable.
 */
import {expect, test} from "bun:test";
import {mkdir, realpath, symlink, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {
  BoundedFileError,
  type BoundedFileErrorCode,
  readBoundedUtf8File,
  readBoundedUtf8FileWithin,
} from "@/package/core/utils/bounded-file";
import {withTempDirectory} from "@tests/helpers/temp-directory";

async function expectBoundedFileError(
  operation: Promise<unknown>,
  expectedCode: BoundedFileErrorCode
): Promise<void> {
  try {
    await operation;
    throw new Error("Expected bounded file read to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(BoundedFileError);
    expect((error as BoundedFileError).code).toBe(expectedCode);
    expect((error as Error).message).toBe(expectedCode);
  }
}

test("readBoundedUtf8File enforces byte limits for UTF-8 content", async () => {
  await withTempDirectory("codex-limits-bounded-file-", async (directory) => {
    const path = join(directory, "value.txt");
    await writeFile(path, "é", "utf8");

    expect(await readBoundedUtf8File(path, 2)).toBe("é");
    await expectBoundedFileError(readBoundedUtf8File(path, 1), "too-large");
  });
});

test("readBoundedUtf8File safely classifies missing and non-file paths", async () => {
  await withTempDirectory("codex-limits-bounded-file-errors-", async (directory) => {
    await expectBoundedFileError(readBoundedUtf8File(join(directory, "missing"), 10), "not-found");
    await expectBoundedFileError(readBoundedUtf8File(directory, 10), "not-file");
  });
});

test("readBoundedUtf8FileWithin binds the opened file to its real root", async () => {
  await withTempDirectory("codex-limits-bounded-file-root-", async (directory) => {
    const root = join(directory, "root");
    const outsidePath = join(directory, "outside.txt");
    await mkdir(root);
    await writeFile(join(root, "inside.txt"), "inside", "utf8");
    await writeFile(outsidePath, "outside", "utf8");
    const realRoot = await realpath(root);

    expect(await readBoundedUtf8FileWithin(join(root, "inside.txt"), 10, realRoot)).toBe("inside");
    await expectBoundedFileError(readBoundedUtf8FileWithin(outsidePath, 10, realRoot), "not-file");

    if (process.platform !== "win32") {
      const linkedRoot = join(directory, "linked-root");
      const nestedLink = join(root, "nested-link");
      await symlink(root, linkedRoot, "dir");
      await symlink(directory, nestedLink, "dir");

      expect(await readBoundedUtf8FileWithin(join(linkedRoot, "inside.txt"), 10, realRoot)).toBe(
        "inside"
      );
      await expectBoundedFileError(
        readBoundedUtf8FileWithin(join(nestedLink, "outside.txt"), 10, realRoot),
        "not-file"
      );
    }
  });
});
