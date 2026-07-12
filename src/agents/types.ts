/**
 * Store the result of installing an agent integration
 * including whether the installation changed any target configuration and
 * the paths of the configuration files inspected by the adapter.
 */
export interface AgentInstallResult {
  // Whether installation changed any target configuration.
  changed: boolean;

  // Configuration paths inspected by the adapter.
  configPaths?: string[];
}

/**
 * Store the structure of an agent integration, including its stable integration ID, name, description, and installation function.
 */
export interface AgentIntegration {
  // ID of the agent integration.
  id: string;

  // Name of the agent integration.
  name: string;

  // Short description of the agent integration.
  description: string;

  // Installation function for the agent integration, returning a promise that resolves to the installation result.
  install: () => Promise<AgentInstallResult>;
}

/**
 * Represents an error that occurs during the installation of an agent integration
 * including a code and a safe message for display.
 */
export class AgentInstallError extends Error {
  readonly code: string;

  constructor(code: string, safeMessage: string) {
    super(safeMessage);
    this.name = "AgentInstallError";
    this.code = code;
  }
}
