import type {AgentIntegration, AgentIntegrationStatus} from "@/agents";
import type {DoctorDto} from "@/package/commands/public-dto";
import type {LiveEndpointStatus} from "@/package/core/types";

/** Formats safe doctor checks as aligned plain text. */
export function formatDoctor(
  result: DoctorDto,
  integrations: readonly Pick<AgentIntegration, "id" | "displayName">[]
): string {
  const diagnostics: Array<readonly [label: string, value: string]> = [
    ["Package version:", result.packageVersion],
    ["Node.js version:", result.nodeVersion],
    ["Operating system:", result.operatingSystem],
    ["Codex home detected:", formatBoolean(result.codexHomeDetected)],
    ["Authentication found:", formatBoolean(result.authenticationFound)],
    ["Local usage found:", formatBoolean(result.localUsageFound)],
    ["Live endpoint:", formatLiveEndpoint(result.liveEndpoint)],
    ...integrations.map(
      (integration) =>
        [
          `${integration.displayName} integration:`,
          formatIntegration(result.agentIntegrations[integration.id] ?? "unknown"),
        ] as const
    ),
  ];
  const labelWidth = Math.max(...diagnostics.map(([label]) => label.length)) + 1;
  const lines = [
    "Codex Limits diagnostics",
    "",
    ...diagnostics.map(([label, value]) => formatLine(label, value, labelWidth)),
    "",
    "No sensitive values were displayed.",
  ];

  return `${lines.join("\n")}\n`;
}

function formatLine(label: string, value: string, labelWidth: number): string {
  return `${label.padEnd(labelWidth)}${value}`;
}

function formatBoolean(value: boolean): string {
  return value ? "Yes" : "No";
}

function formatLiveEndpoint(status: LiveEndpointStatus): string {
  switch (status) {
    case "not-checked":
      return "Not checked";
    case "reachable":
      return "Reachable";
    case "unreachable":
      return "Unreachable";
  }
}

function formatIntegration(status: AgentIntegrationStatus): string {
  switch (status) {
    case "installed":
      return "Installed";
    case "not-installed":
      return "Not installed";
    case "unknown":
      return "Unknown";
  }
}
