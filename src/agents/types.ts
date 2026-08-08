/** Safe read-only integration state used by diagnostics and interactive lifecycle commands. */
export type AgentIntegrationStatus = "installed" | "not-installed" | "unknown";

/** Common idempotent result returned by agent install and uninstall operations. */
export interface AgentLifecycleResult {
  changed: boolean;
  configPaths?: string[];
}

export type AgentInstallResult = AgentLifecycleResult;
export type AgentUninstallResult = AgentLifecycleResult;

export interface AgentEnvironmentVariable {
  readonly name: string;
  readonly description: string;
}

/** Complete adapter contract consumed by lifecycle commands, help, and diagnostics. */
export interface AgentIntegration {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly environment?: readonly AgentEnvironmentVariable[];
  install: () => Promise<AgentLifecycleResult>;
  uninstall: () => Promise<AgentLifecycleResult>;
  inspect: () => Promise<AgentIntegrationStatus>;
}

/** Marks an installation error whose message is safe to show to users. */
export class AgentInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentInstallError";
  }
}

/** Marks an uninstallation error whose message is safe to show to users. */
export class AgentUninstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentUninstallError";
  }
}
