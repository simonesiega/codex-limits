import {expect, test} from "bun:test";
import {parseCommand, type ParsedCommand} from "@/package/commands/cli-parser";

test("parseCommand accepts the complete public command grammar", () => {
  const cases: Array<{args: string[]; expected: ParsedCommand}> = [
    {args: [], expected: {kind: "dashboard"}},
    {args: ["status"], expected: {kind: "status"}},
    {args: ["coupons"], expected: {kind: "coupons", json: false}},
    {args: ["coupons", "--json"], expected: {kind: "coupons", json: true}},
    {args: ["--json"], expected: {kind: "limits-json"}},
    {args: ["--help"], expected: {kind: "help"}},
    {args: ["-h"], expected: {kind: "help"}},
    {args: ["--version"], expected: {kind: "version"}},
    {args: ["-v"], expected: {kind: "version"}},
    {args: ["init", "--opencode"], expected: {kind: "init", args: ["--opencode"]}},
  ];

  for (const item of cases) {
    expect(parseCommand(item.args)).toEqual(item.expected);
  }
});

test("parseCommand rejects duplicate options, malformed combinations, and extra arguments", () => {
  const cases = [
    ["--json", "--json"],
    ["status", "--json"],
    ["status", "extra"],
    ["coupons", "--json", "--json"],
    ["coupons", "extra"],
    ["--help", "--help"],
    ["--version", "extra"],
    ["unknown"],
  ] as const;

  for (const args of cases) {
    expect(parseCommand(args)).toEqual({kind: "invalid", input: args.join(" ")});
  }

  expect(parseCommand(["--access-token", "fake-secret-token"])).toEqual({
    kind: "invalid",
    input: "--access-token [redacted]",
  });
  expect(parseCommand(["C:/Users/private/.codex/auth.json"])).toEqual({
    kind: "invalid",
    input: "[path]",
  });
  expect(parseCommand(["unknown\u001b[31m"])).toEqual({
    kind: "invalid",
    input: "unknown?[31m",
  });
});
