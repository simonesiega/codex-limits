export interface AgentInstallResult {
  changed: boolean;
  configPaths?: string[];
}

export interface AgentIntegration {
  id: string;
  name: string;
  description: string;
  install: () => Promise<AgentInstallResult>;
}

/** Marks an installation error whose message is safe to show to users. */
export class AgentInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentInstallError";
  }
}
