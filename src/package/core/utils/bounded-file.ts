import {constants} from "node:fs";
import type {Stats} from "node:fs";
import {lstat, open} from "node:fs/promises";

export type BoundedFileErrorCode = "not-file" | "not-found" | "read-error" | "too-large";

/** Carries only a safe classification, never a path or raw filesystem error. */
export class BoundedFileError extends Error {
  readonly code: BoundedFileErrorCode;

  constructor(code: BoundedFileErrorCode) {
    super(code);
    this.name = "BoundedFileError";
    this.code = code;
  }
}

/** Reads one regular UTF-8 file while enforcing a byte limit before and during the read. */
export async function readBoundedUtf8File(path: string, maxBytes: number): Promise<string> {
  let handle;

  try {
    const pathDetails = await lstat(path);
    if (!pathDetails.isFile()) {
      throw new BoundedFileError("not-file");
    }

    const noFollow = constants.O_NOFOLLOW;
    const openFlags =
      typeof noFollow === "number" ? constants.O_RDONLY | noFollow : constants.O_RDONLY;
    handle = await open(path, openFlags);
    const details = await handle.stat();
    const currentPathDetails = await lstat(path);
    if (
      !details.isFile() ||
      !currentPathDetails.isFile() ||
      !isSameFile(pathDetails, details) ||
      !isSameFile(details, currentPathDetails)
    ) {
      throw new BoundedFileError("not-file");
    }
    if (details.size > maxBytes) {
      throw new BoundedFileError("too-large");
    }

    // Read one extra byte so a file that grows after stat cannot bypass the bound.
    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    let bytesRead = 0;
    while (bytesRead <= maxBytes) {
      const result = await handle.read(buffer, bytesRead, maxBytes + 1 - bytesRead, null);
      if (result.bytesRead === 0) {
        break;
      }
      bytesRead += result.bytesRead;
    }

    if (bytesRead > maxBytes) {
      throw new BoundedFileError("too-large");
    }
    return buffer.subarray(0, bytesRead).toString("utf8");
  } catch (error) {
    if (error instanceof BoundedFileError) {
      throw error;
    }
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new BoundedFileError("not-found");
    }
    if (isNodeError(error) && error.code === "ELOOP") {
      throw new BoundedFileError("not-file");
    }
    throw new BoundedFileError("read-error");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function isSameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
