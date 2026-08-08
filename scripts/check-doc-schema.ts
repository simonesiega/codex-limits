import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {isDeepStrictEqual} from "node:util";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

const root = resolve(import.meta.dir, "..");
const jsonOutputPath = resolve(root, "docs", "readme", "json-output.md");
const documents = [
  {
    command: "codex-limits --json",
    schema: "codex-limits.schema.json",
    example: "codex-limits-output.example.json",
  },
  {
    command: "codex-limits coupons --json",
    schema: "codex-limits-coupons.schema.json",
    example: "codex-limits-coupons-output.example.json",
  },
  {
    command: "codex-limits doctor --json",
    schema: "codex-limits-doctor.schema.json",
    example: "codex-limits-doctor-output.example.json",
  },
] as const;

try {
  const validator = new Ajv2020({allErrors: true, strict: true});
  addFormats(validator);
  const jsonOutputDocumentation = await readFile(jsonOutputPath, "utf8");

  for (const document of documents) {
    const schema = await readJson(resolve(root, "docs", "schema", document.schema));
    const example = await readJson(resolve(root, "docs", "examples", document.example));
    const validate = validator.compile(schema);

    if (!validate(example)) {
      const details = validator.errorsText(validate.errors, {separator: "\n- "});
      throw new Error(`${document.command} example does not match its schema:\n- ${details}`);
    }

    const inlineExample = readInlineExample(jsonOutputDocumentation, document.example);
    if (!isDeepStrictEqual(inlineExample, example)) {
      throw new Error(
        `${document.command} inline example does not match docs/examples/${document.example}.`
      );
    }
  }

  console.log("All documentation JSON schemas and external and inline examples are valid.");
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown schema validation error.";
  console.error(`Documentation schema check failed: ${message}`);
  process.exitCode = 1;
}

async function readJson(path: string): Promise<unknown> {
  return parseJson(await readFile(path, "utf8"), path);
}

function readInlineExample(content: string, exampleFile: string): unknown {
  const marker = `<!-- validated-example: ${exampleFile} -->`;
  const markerIndex = content.indexOf(marker);
  if (markerIndex === -1 || content.indexOf(marker, markerIndex + marker.length) !== -1) {
    throw new Error(`${jsonOutputPath} must contain exactly one ${marker}.`);
  }

  const afterMarker = markerIndex + marker.length;
  const fence = "```json\n";
  const fenceIndex = content.indexOf(fence, afterMarker);
  if (fenceIndex === -1 || content.slice(afterMarker, fenceIndex).trim() !== "") {
    throw new Error(`${marker} must be followed by a JSON code block.`);
  }

  const jsonStart = fenceIndex + fence.length;
  const jsonEnd = content.indexOf("\n```", jsonStart);
  if (jsonEnd === -1) {
    throw new Error(`${marker} JSON code block is not closed.`);
  }

  return parseJson(content.slice(jsonStart, jsonEnd), `${jsonOutputPath} ${marker}`);
}

function parseJson(content: string, source: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`${source} could not be parsed: ${detail}`);
  }
}
