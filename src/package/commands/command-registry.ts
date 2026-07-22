import type {AgentIntegration} from "@/agents";
import {createAgentsInstallCommand} from "@/package/commands/agents/install-command";
import type {
  CommandGroupDefinition,
  CommandRegistry,
  OptionDefinition,
} from "@/package/commands/command";
import {createCouponsCommand} from "@/package/commands/coupons/command";
import {createDashboardCommand} from "@/package/commands/dashboard/command";
import {createInitCommand} from "@/package/commands/init";
import {assertValidCommandRegistry} from "@/package/commands/registry-validation";
import type {CliRuntime} from "@/package/commands/runtime";
import {createStatusCommand} from "@/package/commands/status/command";

const HELP_OPTION: OptionDefinition = {
  key: "global.help",
  long: "--help",
  short: "-h",
  description: "Print help for the selected command",
  kind: "boolean",
  exclusive: true,
  action: "help",
};

const VERSION_OPTION: OptionDefinition = {
  key: "global.version",
  long: "--version",
  short: "-v",
  description: "Print the package version",
  kind: "boolean",
  exclusive: true,
  action: "version",
  rootOnly: true,
};

const AGENTS_GROUP: CommandGroupDefinition = {
  id: "agents",
  path: ["agents"],
  description: "Manage optional coding-agent integrations",
};

/** Composes command modules with only the runtime capabilities each one needs. */
export function createCommandRegistry(runtime: CliRuntime): CommandRegistry {
  assertValidIntegrations(runtime.agents.integrations);

  const registry: CommandRegistry = {
    program: {
      name: "codex-limits",
      description:
        "A polished TUI dashboard for checking Codex usage limits, reset times, and reset-credit coupons.",
      environment: [
        {name: "CODEX_LIMITS_HOME", description: "Override the local Codex data directory"},
        {name: "CODEX_HOME", description: "Override the local Codex data directory"},
        {
          name: "CODEX_LIMITS_ACCESS_TOKEN",
          description: "Access token for live usage and reset coupons",
        },
        {
          name: "CODEX_LIMITS_ACCOUNT_ID",
          description: "Account ID for live usage and reset coupons",
        },
        {
          name: "CODEX_LIMITS_USAGE_ENDPOINT",
          description: "Override the live usage endpoint",
        },
      ],
      safetyNotes: [
        "Dashboard, status, and coupon commands are read-only.",
        "Agent installation writes only to the explicitly selected agent configuration.",
        "Output never includes tokens, account IDs, auth headers, cookies, or raw local files.",
      ],
    },
    groups: [AGENTS_GROUP],
    commands: [
      createDashboardCommand({io: runtime.io, usage: runtime.usage, ui: runtime.ui}),
      createStatusCommand({io: runtime.io, usage: runtime.usage}),
      createCouponsCommand({io: runtime.io, coupons: runtime.coupons}),
      createAgentsInstallCommand({
        io: runtime.io,
        integrations: runtime.agents.integrations,
      }),
      createInitCommand({io: runtime.io, integrations: runtime.agents.integrations}),
    ],
    globalOptions: [HELP_OPTION, VERSION_OPTION],
  };

  assertValidCommandRegistry(registry);
  return registry;
}

function assertValidIntegrations(integrations: readonly AgentIntegration[]): void {
  const ids = new Set<string>();
  for (const integration of integrations) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(integration.id)) {
      throw new Error(`Invalid agent integration id: ${integration.id}.`);
    }
    if (ids.has(integration.id)) {
      throw new Error(`Duplicate agent integration id: ${integration.id}.`);
    }
    if (
      !isSafeIntegrationText(integration.name, 80) ||
      !isSafeIntegrationText(integration.description, 240)
    ) {
      throw new Error(`Agent integration ${integration.id} has invalid display metadata.`);
    }
    ids.add(integration.id);
  }
}

function isSafeIntegrationText(value: string, maxLength: number): boolean {
  return Boolean(
    value.trim() && value.length <= maxLength && !/[\u0000-\u001f\u007f-\u009f]/.test(value)
  );
}
