/**
 * @fileoverview Host-independent agent support for json config. Agent adapters reuse this module to keep lifecycle and presentation behavior consistent.
 */
import {writeAgentFileAtomically, writeAgentFilesAtomically} from "@/agents/shared/atomic-file";
import {createAgentOperationError, type AgentOperation} from "@/agents/shared/operation";
import {BoundedFileError, readBoundedUtf8File} from "@/package/core/utils/bounded-file";
import {isRecord} from "@/package/core/utils/unknown";

/** Parsed configuration paired with the exact bounded source used for compare-before-write. */
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

/** One size-bounded JSON replacement prepared for a shared atomic write batch. */
export interface AgentJsonUpdate extends AgentJsonDocument {
  readonly path: string;
  readonly maxBytes: number;
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

/** Replaces one bounded agent JSON document only when its source is unchanged. */
export function writeAgentJsonAtomically(
  path: string,
  value: unknown,
  expectedSource: string | null,
  maxBytes: number
): Promise<void> {
  return writeAgentFileAtomically(path, serializeAgentJson(value, maxBytes), expectedSource);
}

/** Prepares and validates agent JSON updates before replacing their target files. */
export function writeAgentJsonFilesAtomically(updates: readonly AgentJsonUpdate[]): Promise<void> {
  return writeAgentFilesAtomically(
    updates.map(({path, value, source, maxBytes}) => ({
      path,
      content: serializeAgentJson(value, maxBytes),
      expectedContent: source,
    }))
  );
}

/** Serializes with stable indentation and enforces the host file limit on encoded bytes. */
function serializeAgentJson(value: unknown, maxBytes: number): string {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new BoundedFileError("read-error");
  }

  const formattedContent = `${serialized}\n`;
  if (Buffer.byteLength(formattedContent, "utf8") <= maxBytes) {
    return formattedContent;
  }

  // Large but valid source documents may only exceed the bound because of pretty-print spacing.
  const compactSerialized = JSON.stringify(value);
  if (compactSerialized === undefined) {
    throw new BoundedFileError("read-error");
  }
  const compactContent = `${compactSerialized}\n`;
  if (Buffer.byteLength(compactContent, "utf8") <= maxBytes) {
    return compactContent;
  }
  throw new BoundedFileError("too-large");
}
