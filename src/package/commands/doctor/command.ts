import type {AgentIntegration, AgentIntegrationStatus} from "@/agents";
import {
  getOutputFormat,
  JSON_OPTION,
  type ReadOnlyCommandDefinition,
} from "@/package/commands/command";
import {formatDoctor} from "@/package/commands/doctor/format";
import {formatJson} from "@/package/commands/format-json";
import type {DoctorDto} from "@/package/commands/public-dto";
import type {
  AgentServices,
  CliIo,
  DoctorServices,
  PackageServices,
} from "@/package/commands/runtime";

interface DoctorCommandDependencies {
  io: Pick<CliIo, "stdout">;
  agents: AgentServices;
  doctor: DoctorServices;
  packageInfo: PackageServices;
}

/** Creates the safe environment diagnostics command. */
export function createDoctorCommand(
  dependencies: DoctorCommandDependencies
): ReadOnlyCommandDefinition {
  return {
    id: "doctor",
    path: ["doctor"],
    description: "Run safe environment and connectivity diagnostics",
    usage: ["codex-limits doctor [--json]"],
    options: [JSON_OPTION],
    safety: "read-only",
    safetyNote:
      "Checks recognized local configuration and live connectivity without displaying sensitive values.",
    failureMessage: "Could not run Codex Limits diagnostics.",
    async execute(values) {
      const [codex, integrationEntries] = await Promise.all([
        dependencies.doctor.loadCodexDiagnostics(),
        Promise.all(dependencies.agents.integrations.map(inspectAgentIntegration)),
      ]);
      const result: DoctorDto = {
        packageVersion: dependencies.packageInfo.version,
        nodeVersion: dependencies.doctor.nodeVersion,
        operatingSystem: dependencies.doctor.operatingSystem,
        codexHomeDetected: codex.codexHomeDetected,
        authenticationFound: codex.authenticationFound,
        localUsageFound: codex.localUsageFound,
        liveEndpoint: codex.liveEndpoint,
        agentIntegrations: Object.fromEntries(integrationEntries),
      };
      dependencies.io.stdout(
        getOutputFormat(values) === "json"
          ? formatJson(result)
          : formatDoctor(result, dependencies.agents.integrations)
      );
      return 0;
    },
  };
}

async function inspectAgentIntegration(
  integration: AgentIntegration
): Promise<readonly [string, AgentIntegrationStatus]> {
  try {
    return [integration.id, await integration.inspect()];
  } catch {
    return [integration.id, "unknown"];
  }
}
