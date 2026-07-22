/** Safe read-only installation state used by integration diagnostics. */
export type AgentIntegrationStatus = "installed" | "not-installed" | "unknown";

export interface AgentInstallResult {
  changed: boolean;
  configPaths?: string[];
}

export interface AgentIntegration {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  install: () => Promise<AgentInstallResult>;
}

/** Marks an installation error whose message is safe to show to users. */
export class AgentInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentInstallError";
  }
}
