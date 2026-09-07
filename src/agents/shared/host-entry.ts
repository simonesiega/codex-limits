/**
 * @fileoverview Host-independent agent support for host entry. Agent adapters reuse this module to keep lifecycle and presentation behavior consistent.
 */
/** Exposes an internal agent adapter through its deliberately narrow package contract. */
export function exposeAgentHost<Contract>(plugin: unknown): Contract {
  return plugin as Contract;
}
