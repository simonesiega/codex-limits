/** Safe read-only installation state used by integration diagnostics. */
export type AgentIntegrationStatus = "installed" | "not-installed" | "unknown";

export interface AgentInstallResult {
  changed: boolean;
  configPaths?: string[];
}

export interface AgentEnvironmentVariable {
  readonly name: string;
  readonly description: string;
}

/** Complete adapter contract consumed by installation, help, and diagnostics. */
export interface AgentIntegration {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly environment?: readonly AgentEnvironmentVariable[];
  install: () => Promise<AgentInstallResult>;
  inspect: () => Promise<AgentIntegrationStatus>;
}

/** Marks an installation error whose message is safe to show to users. */
export class AgentInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentInstallError";
  }
}
