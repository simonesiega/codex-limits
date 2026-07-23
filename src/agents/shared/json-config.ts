import {writeAgentFileAtomically} from "@/agents/shared/atomic-file";

/** Replaces one private agent JSON configuration through an owner-only sibling file. */
export function writeAgentJsonAtomically(path: string, value: unknown): Promise<void> {
  return writeAgentFileAtomically(path, `${JSON.stringify(value, null, 2)}\n`);
}
