/** Normalized availability status shared by core, commands, and UI adapters. */
export type AvailabilityStatus = "available" | "partial" | "unavailable";

/** Source category for a Codex home candidate path. */
export type CodexHomeCandidateSource = "env" | "default";

/** Environment object shape used by filesystem discovery and credential checks. */
export type EnvironmentMap = Record<string, string | undefined>;

/** Credential configuration status for the reset-credit endpoint. */
export type CouponCredentialStatus = "configured" | "partial" | "missing";

/** Options used to make filesystem discovery testable and reusable. */
export interface CodexHomeOptions {
  /** Environment values, defaults to process.env. */
  env?: EnvironmentMap;
  /** Home directory override for tests, defaults to the current OS home. */
  homeDirectory?: string;
  /** Windows roaming app data override for tests. */
  appData?: string;
  /** Windows local app data override for tests. */
  localAppData?: string;
}

/** Options for local usage parsing and aggregation. */
export interface LocalUsageOptions extends CodexHomeOptions {
  /** Current time override used to compute reset durations. */
  now?: Date;
}

/** Options for authenticated Codex backend calls. */
export interface CodexAuthOptions extends CodexHomeOptions {
  /** Auth file path override. */
  authFile?: string;
}

/** Options for the opt-in live reset-coupon lookup. */
export interface CouponOptions extends CodexAuthOptions {
  /** Fetch implementation override used by tests. */
  fetch?: FetchLike;
  /** Endpoint override used by tests. */
  endpoint?: string;
  /** Timeout in milliseconds for the live endpoint request. */
  timeoutMs?: number;
  /** Current time override used by tests. */
  now?: Date;
}

/** Options for the main reusable Codex limits core API. */
export interface CodexLimitsOptions extends CouponOptions {
  /** Whether to include the live coupon summary, defaults to true. */
  includeCoupons?: boolean;
  /** Live usage endpoint override. */
  usageEndpoint?: string;
}

/** A path that may contain local Codex state. */
export interface CodexHomeCandidatePath {
  /** Absolute or normalized path to check. */
  path: string;
  /** Whether the path came from CODEX_LIMITS_HOME or default OS conventions. */
  source: CodexHomeCandidateSource;
}

/** A possible local Codex home directory after checking the filesystem. */
export interface CodexHomeCandidate extends CodexHomeCandidatePath {
  /** Whether the candidate exists and is a readable directory. */
  exists: boolean;
}

/** Result of checking local Codex home candidates. */
export interface CodexHomeDetection {
  /** Normalized CODEX_LIMITS_HOME value, if provided. */
  overrideHome: string | null;
  /** Candidate directories checked in order. */
  candidates: CodexHomeCandidate[];
  /** First readable candidate directory, if one was found. */
  foundHome: string | null;
}

/** A safely inspected local state file. Raw content is intentionally not exposed. */
export interface CodexStateFile {
  /** Absolute path used internally to identify the inspected file. */
  path: string;
  /** Path relative to the detected Codex home. */
  relativePath: string;
  /** Parsed JSON value when the file contains valid JSON. */
  json: unknown | null;
  /** Stable parse/read error code when the file could not be parsed. */
  error: string | null;
}

/** Result of reading safe local Codex state files. */
export interface CodexStateReadResult {
  /** Detected Codex home that was inspected. */
  homePath: string;
  /** Safe JSON files found under the Codex home. */
  files: CodexStateFile[];
  /** Non-sensitive warnings collected while inspecting local files. */
  warnings: string[];
}

/** A token-count rate-limit snapshot extracted from a local Codex session log. */
export interface CodexSessionSnapshot {
  /** Absolute rollout JSONL file path where the snapshot was found. */
  sessionFile: string;
  /** Rollout JSONL path relative to the detected Codex home. */
  relativePath: string;
  /** Codex thread id when the session metadata exposes it. */
  threadId: string | null;
  /** Event timestamp from the session log when present. */
  eventTimestamp: string | null;
  /** Raw rate_limits object from a token_count event, kept in memory only for parsing. */
  rateLimits: Record<string, unknown>;
}

/** Metadata for a local rollout JSONL file inspected by the session reader. */
export interface CodexSessionFile {
  /** Absolute rollout JSONL file path. */
  path: string;
  /** Path relative to the detected Codex home. */
  relativePath: string;
  /** Last modified time in milliseconds since epoch. */
  modifiedAtMs: number;
  /** Whether a token_count rate-limit snapshot was found in this file. */
  hasSnapshot: boolean;
  /** Stable read/parse error code when the file could not be inspected. */
  error: string | null;
}

/** Result of inspecting local Codex rollout JSONL session logs. */
export interface CodexSessionReadResult {
  /** Detected Codex home that was inspected. */
  homePath: string;
  /** Sessions directory under the detected Codex home. */
  sessionsRoot: string;
  /** Rollout JSONL files inspected, newest first. */
  files: CodexSessionFile[];
  /** Latest token-count rate-limit snapshot, if one was found. */
  latestSnapshot: CodexSessionSnapshot | null;
  /** Non-sensitive warnings collected while inspecting session logs. */
  warnings: string[];
}

/** A normalized Codex usage window. Unknown values are represented as null. */
export interface UsageWindow {
  /** Human label such as 5-hour usage limit or Weekly usage limit. */
  label: string;
  /** Remaining capacity as a 0-100 percentage. */
  remainingPercent: number | null;
  /** Used capacity as a 0-100 percentage. */
  usedPercent: number | null;
  /** Reset timestamp as an ISO string when available. */
  resetsAt: string | null;
  /** Compact duration until reset, without seconds. */
  resetsIn: string | null;
}

/** Normalized usage windows shown by all product surfaces. */
export interface UsageWindows {
  /** The short 5-hour Codex usage window. */
  fiveHour: UsageWindow | null;
  /** The longer weekly Codex usage window. */
  weekly: UsageWindow | null;
}

/** Local usage data parsed from Codex files before live coupons are merged. */
export interface LocalUsageResult {
  /** Whether local usage data is complete, partial, or unavailable. */
  status: AvailabilityStatus;
  /** Normalized 5-hour and weekly windows. */
  windows: UsageWindows;
  /** Non-sensitive warnings collected while reading or parsing local data. */
  warnings: string[];
}

/** Source for usage-limit windows. */
export type UsageSourceKind = "api" | "local" | "unavailable";

/** Usage-limit window source metadata. */
export interface UsageSource {
  /** Stable source kind used by commands and UI adapters. */
  kind: UsageSourceKind;
  /** Human-readable source label. */
  label: string;
  /** Endpoint used when the source is a live API. */
  endpoint?: string;
}

/** Live or fallback usage result consumed by the dashboard. */
export interface UsageResult extends LocalUsageResult {
  /** Source for the selected usage windows. */
  source: UsageSource;
}

/** One normalized reset-credit coupon. */
export interface CouponItem {
  /** 1-based display index after sorting by expiration. */
  index: number;
  /** Server-provided coupon status, such as available. */
  status: string | null;
  /** Server-provided UTC grant timestamp. */
  grantedAt: string | null;
  /** Server-provided UTC expiration timestamp. */
  expiresAt: string | null;
  /** Human-readable local expiration date, such as Monday 4 July 2026. */
  expirationDate: string | null;
  /** Compact duration until expiration, without seconds. */
  expiresIn: string | null;
}

/** Coupon summary used by the TUI, commands, and future adapters. */
export interface CouponSummary {
  /** Whether live coupon data is complete, partial, or unavailable. */
  status: AvailabilityStatus;
  /** Available reset-credit count, when returned by the endpoint. */
  available: number | null;
  /** Total earned reset-credit count, when returned by the endpoint. */
  earnedThisPeriod: number | null;
  /** Local date for the next available or soonest expiring coupon. */
  nextExpirationDate: string | null;
  /** Time left for the next available or soonest expiring coupon. */
  nextExpirationIn: string | null;
  /** Reset-credit coupons sorted by expiration. */
  items: CouponItem[];
  /** Non-sensitive coupon warnings. */
  warnings: string[];
}

/** Source metadata for live reset-credit coupon data. */
export interface CouponSource {
  /** Whether the live endpoint was successfully used. */
  live: boolean;
  /** Human-readable source label. */
  label: string;
  /** Live endpoint used for the opt-in request. */
  endpoint: string;
}

/** Full reset-credit coupon result from the reusable core. */
export interface CouponResult extends CouponSummary {
  /** Source metadata for the coupon lookup. */
  source: CouponSource;
}

/** Combined normalized result consumed by commands, the TUI, and future plugins. */
export interface CodexLimitsResult {
  /** Normalized 5-hour and weekly windows. */
  windows: UsageWindows;
  /** Source for the usage-limit windows. */
  usageSource: UsageSource;
  /** Reset-credit coupon summary, or null when intentionally omitted. */
  coupons: CouponSummary | null;
  /** Non-sensitive warnings from local and live sources. */
  warnings: string[];
}

/** Minimal response shape needed from fetch for live coupon lookups. */
export interface FetchResponseLike {
  /** Whether the HTTP status is in the successful range. */
  ok: boolean;
  /** HTTP status code. */
  status: number;
  /** Parses the response body as JSON. */
  json: () => Promise<unknown>;
}

/** Minimal fetch function shape used by the live coupon client. */
export type FetchLike = (
  url: string,
  init: {
    method: "GET";
    headers: Record<string, string>;
    signal?: AbortSignal;
  },
) => Promise<FetchResponseLike>;
