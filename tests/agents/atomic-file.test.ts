import {expect, test} from "bun:test";
import {readFile, readdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {
  removeAgentFileIfUnchanged,
  writeAgentFileAtomically,
  writeAgentFilesAtomically,
} from "@/agents/shared/atomic-file";
import {withTempDirectory} from "@tests/helpers/temp-directory";

test("agent file replacement requires the bounded read snapshot", async () => {
  await withTempDirectory("codex-limits-agent-file-", async (directory) => {
    const path = join(directory, "settings.json");

    await writeAgentFileAtomically(path, "first\n", null);
    await expect(writeAgentFileAtomically(path, "unexpected\n", null)).rejects.toThrow(
      "changed during the operation"
    );
    await expect(writeAgentFileAtomically(path, "unexpected\n", "stale\n")).rejects.toThrow(
      "changed during the operation"
    );
    expect(await readFile(path, "utf8")).toBe("first\n");

    await writeAgentFileAtomically(path, "second\n", "first\n");
    expect(await readFile(path, "utf8")).toBe("second\n");
    expect(await readdir(directory)).toEqual(["settings.json"]);
  });
});

test("agent file batches validate every snapshot before replacing any target", async () => {
  await withTempDirectory("codex-limits-agent-batch-", async (directory) => {
    const firstPath = join(directory, "first.json");
    const secondPath = join(directory, "second.json");
    await Promise.all([
      writeFile(firstPath, "first-before\n", "utf8"),
      writeFile(secondPath, "second-before\n", "utf8"),
    ]);

    await expect(
      writeAgentFilesAtomically([
        {
          path: firstPath,
          content: "first-after\n",
          expectedContent: "first-before\n",
        },
        {
          path: secondPath,
          content: "second-after\n",
          expectedContent: "stale\n",
        },
      ])
    ).rejects.toThrow("changed during the operation");

    expect(await readFile(firstPath, "utf8")).toBe("first-before\n");
    expect(await readFile(secondPath, "utf8")).toBe("second-before\n");
    expect((await readdir(directory)).sort()).toEqual(["first.json", "second.json"]);
  });
});

test("agent file removal refuses content changed after inspection", async () => {
  await withTempDirectory("codex-limits-agent-remove-", async (directory) => {
    const path = join(directory, "extension.mjs");
    await writeFile(path, "managed-current\n", "utf8");

    await expect(removeAgentFileIfUnchanged(path, "managed-stale\n")).rejects.toThrow(
      "changed during the operation"
    );
    expect(await readFile(path, "utf8")).toBe("managed-current\n");

    await removeAgentFileIfUnchanged(path, "managed-current\n");
    await expect(readFile(path, "utf8")).rejects.toThrow();
  });
});
