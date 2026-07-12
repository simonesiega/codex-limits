import {open} from "node:fs/promises";

// Stable reasons a bounded local-file read can fail.
export type BoundedFileErrorCode = "not-file" | "not-found" | "read-error" | "too-large";

/**
 * Error carrying only a safe code, never a path or raw filesystem message.
 */
export class BoundedFileError extends Error {
  readonly code: BoundedFileErrorCode;

  constructor(code: BoundedFileErrorCode) {
    super(code);
    this.name = "BoundedFileError";
    this.code = code;
  }
}

/**
 * Reads a UTF-8 file with a maximum byte limit, returning its contents as a string.
 * @param path - The path to the file to read.
 * @param maxBytes - The maximum number of bytes to read from the file.
 * @returns - A promise that resolves to the file contents as a string.
 * @throws - Throws a BoundedFileError if the file is not found, is not a regular file, exceeds the byte limit, or if there is a read error.
 */
export async function readBoundedUtf8File(path: string, maxBytes: number): Promise<string> {
  let handle;

  try {
    handle = await open(path, "r");
    const details = await handle.stat();
    if (!details.isFile()) {
      throw new BoundedFileError("not-file");
    }

    if (details.size > maxBytes) {
      throw new BoundedFileError("too-large");
    }

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
    throw new BoundedFileError("read-error");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/**
 * Check if an unknown error is a Node.js ErrnoException.
 * @param error - The unknown error to check.
 * @returns - True if the error is a Node.js ErrnoException, false otherwise.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
