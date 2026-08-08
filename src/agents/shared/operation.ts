import {AgentInstallError, AgentUninstallError} from "@/agents/types";

export type AgentOperation = "install" | "uninstall";
export type AgentOperationError = AgentInstallError | AgentUninstallError;

/** Creates the user-safe error class matching the active lifecycle operation. */
export function createAgentOperationError(
  operation: AgentOperation,
  message: string
): AgentOperationError {
  return operation === "uninstall"
    ? new AgentUninstallError(message)
    : new AgentInstallError(message);
}

/** Reports whether an error is an intentionally user-safe lifecycle error. */
export function isAgentOperationError(error: unknown): error is AgentOperationError {
  return error instanceof AgentInstallError || error instanceof AgentUninstallError;
}
