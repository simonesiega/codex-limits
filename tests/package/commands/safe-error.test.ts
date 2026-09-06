import {expect, test} from "bun:test";
import {sanitizePublicErrorMessage} from "@/package/commands/safe-error";

test("sanitizePublicErrorMessage rejects unsafe public errors", () => {
  const cases = [
    {
      name: "credential and path",
      message: "Bearer fake-secret-token at (C:/private/config.json)",
      expected: "Command failed.",
    },
    {
      name: "embedded path",
      message: "details:C:/private/config.json",
      expected: "Command failed.",
    },
    {
      name: "oversized",
      message: "x".repeat(241),
      expected: "Command failed.",
    },
    {
      name: "terminal controls",
      message: "Safe\u001b[31m\u009b32m message",
      expected: "Safe?[31m?32m message",
    },
  ];

  for (const item of cases) {
    expect(sanitizePublicErrorMessage(item.message, "Command failed."), item.name).toBe(
      item.expected
    );
  }
});
