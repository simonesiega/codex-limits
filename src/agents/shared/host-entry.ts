/** Exposes an internal agent adapter through its deliberately narrow package contract. */
export function exposeAgentHost<Contract>(plugin: unknown): Contract {
  return plugin as Contract;
}
