import {platform} from "node:os";
import {stdin as processStdin, stdout as processStdout} from "node:process";
import {createInterface} from "node:readline/promises";
import {AGENT_INTEGRATIONS, type AgentIntegration} from "@/agents";
import {consumeResetCoupon, getResetCoupons} from "@/package/core/coupons/reset-coupons";
import {getCodexDiagnostics} from "@/package/core/doctor";
import {getCodexLimits} from "@/package/core/limits";
import type {
  CodexDiagnosticsResult,
  CodexLimitsResult,
  CouponResult,
  ResetCouponResult,
} from "@/package/core/types";
import {PACKAGE_VERSION} from "@/package/version";

export type WriteOutput = (text: string) => void;
export type Prompt = ((question: string) => Promise<string>) & {
  close?: () => Promise<void> | void;
};

export interface CliIo {
  stdout: WriteOutput;
  stderr: WriteOutput;
  interactive: boolean;
  createPrompt: () => Prompt;
}

export interface UsageServices {
  loadLimits: () => Promise<CodexLimitsResult>;
}

export interface CouponServices {
  loadCoupons: () => Promise<CouponResult>;
}

export interface ResetServices {
  loadCoupons: () => Promise<CouponResult>;
  consumeCoupon: (couponId: string) => Promise<ResetCouponResult>;
}

export interface AgentServices {
  integrations: readonly AgentIntegration[];
}

export interface DoctorServices {
  loadCodexDiagnostics: () => Promise<CodexDiagnosticsResult>;
  nodeVersion: string;
  operatingSystem: string;
}

export interface UiServices {
  renderDashboard: (result: CodexLimitsResult) => Promise<void> | void;
}

export interface PackageServices {
  version: string;
}

export interface CliRuntime {
  io: CliIo;
  usage: UsageServices;
  coupons: CouponServices;
  reset: ResetServices;
  agents: AgentServices;
  doctor: DoctorServices;
  ui: UiServices;
  packageInfo: PackageServices;
}

export interface CliRuntimeOverrides {
  io?: Partial<CliIo>;
  usage?: Partial<UsageServices>;
  coupons?: Partial<CouponServices>;
  reset?: Partial<ResetServices>;
  agents?: Partial<AgentServices>;
  doctor?: Partial<DoctorServices>;
  ui?: Partial<UiServices>;
  packageInfo?: Partial<PackageServices>;
}

/** Creates the production runtime while allowing capability-scoped test overrides. */
export function createCliRuntime(overrides: CliRuntimeOverrides = {}): CliRuntime {
  const defaults: CliRuntime = {
    io: {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      interactive: Boolean(processStdin.isTTY && processStdout.isTTY),
      createPrompt: createTerminalPrompt,
    },
    usage: {loadLimits: getCodexLimits},
    coupons: {loadCoupons: getResetCoupons},
    reset: {loadCoupons: getResetCoupons, consumeCoupon: consumeResetCoupon},
    agents: {integrations: AGENT_INTEGRATIONS},
    doctor: {
      loadCodexDiagnostics: getCodexDiagnostics,
      nodeVersion: process.versions.node,
      operatingSystem: getOperatingSystemName(platform()),
    },
    ui: {renderDashboard: renderDefaultDashboard},
    packageInfo: {version: PACKAGE_VERSION},
  };

  return {
    io: {...defaults.io, ...overrides.io},
    usage: {...defaults.usage, ...overrides.usage},
    coupons: {...defaults.coupons, ...overrides.coupons},
    reset: {...defaults.reset, ...overrides.reset},
    agents: {...defaults.agents, ...overrides.agents},
    doctor: {...defaults.doctor, ...overrides.doctor},
    ui: {...defaults.ui, ...overrides.ui},
    packageInfo: {...defaults.packageInfo, ...overrides.packageInfo},
  };
}

function getOperatingSystemName(value: NodeJS.Platform): string {
  const names: Partial<Record<NodeJS.Platform, string>> = {
    aix: "AIX",
    android: "Android",
    darwin: "macOS",
    freebsd: "FreeBSD",
    linux: "Linux",
    openbsd: "OpenBSD",
    sunos: "Solaris",
    win32: "Windows",
  };
  return names[value] ?? value;
}

function createTerminalPrompt(): Prompt {
  const reader = createInterface({input: processStdin, output: processStdout});
  const prompt: Prompt = (question) => reader.question(question);
  prompt.close = () => reader.close();
  return prompt;
}

async function renderDefaultDashboard(result: CodexLimitsResult): Promise<void> {
  // Keep Ink out of startup paths used by plain-text, JSON, and agent commands.
  const {renderApp} = await import("@/package/tui/app");
  await renderApp(result);
}
