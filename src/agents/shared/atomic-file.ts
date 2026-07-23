import {randomUUID} from "node:crypto";
import {mkdir, rename, rm, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";

/** Replaces one private agent file through an owner-only sibling file. */
export async function writeAgentFileAtomically(path: string, content: string): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = join(directory, `.codex-limits-${randomUUID()}.tmp`);
  await mkdir(directory, {recursive: true});

  try {
    await writeFile(temporaryPath, content, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, {force: true}).catch(() => undefined);
  }
}
