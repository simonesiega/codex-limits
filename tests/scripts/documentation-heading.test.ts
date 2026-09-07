/**
 * @fileoverview Behavioral coverage for documentation heading. The cases document the supported contract and isolate filesystem, network, or host state where applicable.
 */
import {expect, test} from "bun:test";
import {stripHtmlTags} from "../../scripts/documentation-heading";

const cases = [
  {name: "ordinary tag", input: "Hello <em>world</em>", expected: "Hello world"},
  {
    name: "nested opening delimiter",
    input: "Hello <<script>alert(1)</script>",
    expected: "Hello alert(1)",
  },
  {name: "incomplete tag", input: "Hello <script", expected: "Hello "},
  {name: "standalone closing delimiter", input: "Hello > world", expected: "Hello  world"},
];

test("HTML tag stripping cannot expose an HTML opening delimiter", () => {
  for (const {name, input, expected} of cases) {
    const result = stripHtmlTags(input);

    expect(result, name).toBe(expected);
    expect(result, name).not.toContain("<");
    expect(result, name).not.toContain(">");
  }
});
