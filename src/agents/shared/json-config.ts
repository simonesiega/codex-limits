import {writeAgentFileAtomically, writeAgentFilesAtomically} from "@/agents/shared/atomic-file";
import {createAgentOperationError, type AgentOperation} from "@/agents/shared/operation";
import {BoundedFileError, readBoundedUtf8File} from "@/package/core/utils/bounded-file";
import {isRecord} from "@/package/core/utils/unknown";

export interface AgentJsonDocument {
  value: Record<string, unknown>;
  readonly source: string | null;
}

interface ReadAgentJsonObjectOptions {
  maxBytes: number;
  operation: AgentOperation;
  messages: {
    tooLarge: string;
    read: string;
    invalidJson: string;
    notObject: string;
  };
}

export interface AgentJsonUpdate extends AgentJsonDocument {
  readonly path: string;
}

/** Reads one bounded agent JSON object and retains its source for safe replacement. */
export async function readAgentJsonObject(
  path: string,
  options: ReadAgentJsonObjectOptions
): Promise<AgentJsonDocument> {
  let source: string;
  try {
    source = await readBoundedUtf8File(path, options.maxBytes);
  } catch (error) {
    if (error instanceof BoundedFileError) {
      if (error.code === "not-found") {
        return {value: {}, source: null};
      }
      if (error.code === "too-large") {
        throw createAgentOperationError(options.operation, options.messages.tooLarge);
      }
    }
    throw createAgentOperationError(options.operation, options.messages.read);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw createAgentOperationError(options.operation, options.messages.invalidJson);
  }
  if (!isRecord(parsed)) {
    throw createAgentOperationError(options.operation, options.messages.notObject);
  }
  return {value: parsed, source};
}

/** Replaces one agent JSON document only when its bounded source is unchanged. */
export function writeAgentJsonAtomically(
  path: string,
  value: unknown,
  expectedSource: string | null
): Promise<void> {
  return writeAgentFileAtomically(path, serializeAgentJson(value), expectedSource);
}

/** Prepares and validates agent JSON updates before replacing their target files. */
export function writeAgentJsonFilesAtomically(updates: readonly AgentJsonUpdate[]): Promise<void> {
  return writeAgentFilesAtomically(
    updates.map(({path, value, source}) => ({
      path,
      content: serializeAgentJson(value),
      expectedContent: source,
    }))
  );
}

function serializeAgentJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
