import {expect, test} from "bun:test";
import {writeFile} from "node:fs/promises";
import {join} from "node:path";
import {
  BoundedFileError,
  type BoundedFileErrorCode,
  readBoundedUtf8File,
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
