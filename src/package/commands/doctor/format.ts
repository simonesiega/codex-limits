import type {AgentIntegrationStatus} from "@/agents";
import type {DoctorDto} from "@/package/commands/public-dto";
import type {LiveEndpointStatus} from "@/package/core/types";

const LABEL_WIDTH = 23;

/** Formats safe doctor checks as aligned plain text. */
export function formatDoctor(result: DoctorDto): string {
  const lines = [
    "Codex Limits diagnostics",
    "",
    formatLine("Package version:", result.packageVersion),
    formatLine("Node.js version:", result.nodeVersion),
    formatLine("Operating system:", result.operatingSystem),
    formatLine("Codex home detected:", formatBoolean(result.codexHomeDetected)),
    formatLine("Authentication found:", formatBoolean(result.authenticationFound)),
    formatLine("Local usage found:", formatBoolean(result.localUsageFound)),
    formatLine("Live endpoint:", formatLiveEndpoint(result.liveEndpoint)),
    formatLine("OpenCode integration:", formatIntegration(result.opencodeIntegration)),
    "",
    "No sensitive values were displayed.",
  ];

  return `${lines.join("\n")}\n`;
}

function formatLine(label: string, value: string): string {
  return `${label.padEnd(LABEL_WIDTH)}${value}`;
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
