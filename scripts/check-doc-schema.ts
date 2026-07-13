import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

const root = resolve(import.meta.dir, "..");
const schemaPath = resolve(root, "docs", "schema", "codex-limits.schema.json");
const examplePath = resolve(root, "docs", "examples", "codex-limits-output.example.json");

try {
  const schema = await readJson(schemaPath);
  const example = await readJson(examplePath);
  const validator = new Ajv2020({allErrors: true, strict: true});
  addFormats(validator);
  const validate = validator.compile(schema);

  if (!validate(example)) {
    const details = validator.errorsText(validate.errors, {separator: "\n- "});
    throw new Error(`Example output does not match the schema:\n- ${details}`);
  }

  console.log("Documentation JSON schema and example output are valid.");
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown schema validation error.";
  console.error(`Documentation schema check failed: ${message}`);
  process.exitCode = 1;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`${path} could not be parsed: ${detail}`);
  }
}
