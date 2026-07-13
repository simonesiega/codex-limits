import {expect, test} from "bun:test";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {resolveCodexCredentialResult} from "@/package/core/auth/codex-auth";

const SECRET_TOKEN = "fake-secret-access-token";
const SECRET_ACCOUNT = "fake-private-account-id";

test("credential discovery classifies complete and partial environment overrides", async () => {
  const complete = await resolveCodexCredentialResult({
    env: {
      CODEX_LIMITS_ACCESS_TOKEN: ` ${SECRET_TOKEN} `,
      CODEX_LIMITS_ACCOUNT_ID: ` ${SECRET_ACCOUNT} `,
    },
  });
  const partial = await resolveCodexCredentialResult({
    env: {CODEX_LIMITS_ACCESS_TOKEN: SECRET_TOKEN},
  });

  expect(complete.status).toBe("configured");
  expect(complete.credentials).toEqual({accessToken: SECRET_TOKEN, accountId: SECRET_ACCOUNT});
  expect(partial.status).toBe("partial");
  expect(partial.credentials).toBeNull();
  expect(partial.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
    "auth.environment.partial",
  ]);
  expect(JSON.stringify(partial)).not.toContain(SECRET_TOKEN);
});

test("credential discovery safely classifies malformed and oversized auth files", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-limits-auth-errors-"));
  const malformedPath = join(home, "malformed.json");
  const oversizedPath = join(home, "oversized.json");

  try {
    await writeFile(malformedPath, `{"tokens":{"access_token":"${SECRET_TOKEN}"`, "utf8");
    await writeFile(oversizedPath, "x".repeat(1_000_001), "utf8");

    const malformed = await resolveCodexCredentialResult({env: {}, authFile: malformedPath});
    const oversized = await resolveCodexCredentialResult({env: {}, authFile: oversizedPath});

    expect(malformed.status).toBe("malformed");
    expect(malformed.diagnostics[0]?.code).toBe("auth.file.malformed");
    expect(oversized.status).toBe("unreadable");
    expect(oversized.diagnostics[0]?.code).toBe("auth.file.too-large");
    expect(JSON.stringify({malformed, oversized})).not.toContain(SECRET_TOKEN);
    expect(JSON.stringify({malformed, oversized})).not.toContain(home);
  } finally {
    await rm(home, {recursive: true, force: true});
  }
});
