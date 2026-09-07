/**
 * @fileoverview Behavioral coverage for redact. The cases document the supported contract and isolate filesystem, network, or host state where applicable.
 */
import {expect, test} from "bun:test";
import {redactSensitiveText, redactWarnings} from "@/package/core/utils/redact";

test("redactSensitiveText removes supported credential shapes", () => {
  const cases = [
    ["Authorization: Bearer fake-secret-token", "[redacted]"],
    ['{"access_token":"fake-secret-token"}', "{[redacted]}"],
    ["https://example.test/?account_id=fake-private-account", "https://example.test/?[redacted]"],
    ["access-token=fake-access-token", "[redacted]"],
    ["password: fake-password", "[redacted]"],
    ['password: "two private words"', "[redacted]"],
    ["Authorization: Basic fake-basic-credential", "[redacted]"],
    ["00000000-0000-0000-0000-000000000000", "[redacted]"],
    ["eyJmYWtl.fakepayload.fakesignature", "[redacted]"],
  ] as const;

  for (const [input, expected] of cases) {
    expect(redactSensitiveText(input), input).toBe(expected);
  }
});

test("public warning redaction strips controls from every warning", () => {
  expect(redactWarnings(["safe\u001b[31m", "Bearer fake-secret-token\u009b32m"])).toEqual([
    "safe?[31m",
    "[redacted]?32m",
  ]);
});
