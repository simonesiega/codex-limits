import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

const root = resolve(import.meta.dir, "..");
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

  for (const document of documents) {
    const schema = await readJson(resolve(root, "docs", "schema", document.schema));
    const example = await readJson(resolve(root, "docs", "examples", document.example));
    const validate = validator.compile(schema);

    if (!validate(example)) {
      const details = validator.errorsText(validate.errors, {separator: "\n- "});
      throw new Error(`${document.command} example does not match its schema:\n- ${details}`);
    }
  }

  console.log("All documentation JSON schemas and example outputs are valid.");
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
