import {randomUUID} from "node:crypto";
import {mkdir, rename, rm, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";

/** Replaces one private agent JSON configuration through an owner-only sibling file. */
export async function writeAgentJsonAtomically(path: string, value: unknown): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = join(directory, `.codex-limits-${randomUUID()}.tmp`);
  await mkdir(directory, {recursive: true});

  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, {force: true}).catch(() => undefined);
  }
}
