import {randomUUID} from "node:crypto";
import {mkdir, open, rename, rm, unlink} from "node:fs/promises";
import {dirname, join} from "node:path";
import {BoundedFileError, readBoundedUtf8File} from "@/package/core/utils/bounded-file";

export interface AgentFileUpdate {
  readonly path: string;
  readonly content: string;
  readonly expectedContent: string | null;
}

class AgentFileChangedError extends Error {
  constructor() {
    super("Agent configuration changed during the operation.");
    this.name = "AgentFileChangedError";
  }
}

/** Prepares and validates updates before atomically replacing each private agent file. */
export async function writeAgentFilesAtomically(
  updates: readonly AgentFileUpdate[]
): Promise<void> {
  if (new Set(updates.map((update) => update.path)).size !== updates.length) {
    throw new AgentFileChangedError();
  }

  const prepared: Array<AgentFileUpdate & {temporaryPath: string}> = [];
  const committed: AgentFileUpdate[] = [];
  try {
    for (const update of updates) {
      const directory = dirname(update.path);
      const temporaryPath = join(directory, `.codex-limits-${randomUUID()}.tmp`);
      await mkdir(directory, {recursive: true});
      const handle = await open(temporaryPath, "wx", 0o600);
      prepared.push({...update, temporaryPath});
      try {
        await handle.writeFile(update.content, "utf8");
      } finally {
        await handle.close().catch(() => undefined);
      }
    }

    // Validate every snapshot before the first replacement, then again immediately before each one.
    await Promise.all(
      prepared.map((update) => assertAgentFileUnchanged(update.path, update.expectedContent))
    );
    for (const update of prepared) {
      await assertAgentFileUnchanged(update.path, update.expectedContent);
      await rename(update.temporaryPath, update.path);
      committed.push(update);
    }
  } catch (error) {
    await rollbackAgentFileUpdates(committed);
    throw error;
  } finally {
    await Promise.all(
      prepared.map((update) => rm(update.temporaryPath, {force: true}).catch(() => undefined))
    );
  }
}

/** Replaces one private agent file only if it still matches the bounded read snapshot. */
export function writeAgentFileAtomically(
  path: string,
  content: string,
  expectedContent: string | null
): Promise<void> {
  return writeAgentFilesAtomically([{path, content, expectedContent}]);
}

/** Removes one private agent file only if it still matches the bounded read snapshot. */
export async function removeAgentFileIfUnchanged(
  path: string,
  expectedContent: string
): Promise<void> {
  await assertAgentFileUnchanged(path, expectedContent);
  await unlink(path);
}

async function rollbackAgentFileUpdates(updates: readonly AgentFileUpdate[]): Promise<void> {
  for (const update of [...updates].reverse()) {
    try {
      if (update.expectedContent === null) {
        await removeAgentFileIfUnchanged(update.path, update.content);
      } else {
        await writeAgentFileAtomically(update.path, update.expectedContent, update.content);
      }
    } catch {
      // Rollback is best effort and must never replace the original safe operation failure.
    }
  }
}

async function assertAgentFileUnchanged(
  path: string,
  expectedContent: string | null
): Promise<void> {
  let currentContent: string | null;
  try {
    currentContent = await readBoundedUtf8File(
      path,
      expectedContent === null ? 0 : Buffer.byteLength(expectedContent, "utf8")
    );
  } catch (error) {
    if (error instanceof BoundedFileError && error.code === "not-found") {
      currentContent = null;
    } else {
      throw new AgentFileChangedError();
    }
  }

  if (currentContent !== expectedContent) {
    throw new AgentFileChangedError();
  }
}
