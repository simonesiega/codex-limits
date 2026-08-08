# JSON output

[← Documentation hub](../README.md) · [Project README](../../README.md)

`codex-limits` provides predictable, machine-readable JSON for scripts and automation.

## Commands

```bash
# Usage windows, coupons, and combined warnings
codex-limits --json

# Coupon summary only
codex-limits coupons --json

# Safe environment and connectivity diagnostics
codex-limits doctor --json
```

`status --json` is not part of the CLI grammar. Use the root `--json` option for usage data.

Successful commands write one pretty-printed JSON value, followed by a newline, to standard output and exit with code `0`. Loading or serialization failures write a safe message to standard error, write no partial JSON to standard output, and exit with code `1`.

The doctor document reports only versions, a generic operating-system name, booleans, and bounded status values. It never includes credentials, private paths, endpoint URLs, configuration contents, or raw Codex files.

Warnings and unavailable live data do not cause a non-zero exit code when the command can still produce a valid JSON document. Consumers should inspect the `warnings` arrays and nullable fields when determining data availability.

## Complete limits document

`codex-limits --json` returns this shape:

```ts
interface CodexLimitsJson {
  windows: {
    fiveHour: UsageWindowJson | null;
    weekly: UsageWindowJson | null;
  };
  coupons: CouponSummaryJson | null;
  warnings: string[];
}

interface UsageWindowJson {
  label: string;
  remainingPercent: number | null;
  usedPercent: number | null;
  resetsAt: string | null;
  resetsIn: string | null;
}
```

This example represents a sanitized snapshot:

<!-- validated-example: codex-limits-output.example.json -->

```json
{
  "windows": {
    "fiveHour": {
      "label": "5-hour usage limit",
      "remainingPercent": 80,
      "usedPercent": 20,
      "resetsAt": "2026-07-14T01:30:15.000Z",
      "resetsIn": "3h 55m"
    },
    "weekly": {
      "label": "Weekly usage limit",
      "remainingPercent": 31,
      "usedPercent": 69,
      "resetsAt": "2026-07-18T11:15:15.000Z",
      "resetsIn": "4d 13h 40m"
    }
  },
  "coupons": {
    "available": 4,
    "earnedThisPeriod": 0,
    "nextExpirationDate": "Saturday 18 July 2026",
    "nextExpirationIn": "4d 2h 42m",
    "items": [
      {
        "index": 1,
        "status": "available",
        "grantedAt": "2026-06-18T00:17:20.252556Z",
        "expiresAt": "2026-07-18T00:17:20.252556Z",
        "expirationDate": "Saturday 18 July 2026",
        "expiresIn": "4d 2h 42m"
      },
      {
        "index": 2,
        "status": "available",
        "grantedAt": "2026-06-26T23:48:13.132409Z",
        "expiresAt": "2026-07-26T23:48:13.132409Z",
        "expirationDate": "Monday 27 July 2026",
        "expiresIn": "13d 2h 12m"
      },
      {
        "index": 3,
        "status": "available",
        "grantedAt": "2026-07-01T19:59:47.228684Z",
        "expiresAt": "2026-07-31T19:59:47.228684Z",
        "expirationDate": "Friday 31 July 2026",
        "expiresIn": "17d 22h 24m"
      },
      {
        "index": 4,
        "status": "available",
        "grantedAt": "2026-07-13T17:48:41.527506Z",
        "expiresAt": "2026-08-12T17:48:41.527506Z",
        "expirationDate": "Wednesday 12 August 2026",
        "expiresIn": "29d 20h 13m"
      }
    ],
    "warnings": []
  },
  "warnings": [
    "Skipped a sensitive-looking local file.",
    "Skipped a local cache file because it is too large to inspect safely."
  ]
}
```

## Coupon document

`codex-limits coupons --json` returns the coupon object directly:

```ts
interface CouponSummaryJson {
  available: number | null;
  earnedThisPeriod: number | null;
  nextExpirationDate: string | null;
  nextExpirationIn: string | null;
  items: CouponItemJson[];
  warnings: string[];
}

interface CouponItemJson {
  index: number;
  status: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  expirationDate: string | null;
  expiresIn: string | null;
}
```

Sanitized example ([see the sanitized coupon example](../examples/codex-limits-coupons-output.example.json)):

<!-- validated-example: codex-limits-coupons-output.example.json -->

```json
{
  "available": 2,
  "earnedThisPeriod": 4,
  "nextExpirationDate": "Monday 20 July 2026",
  "nextExpirationIn": "7d 4h 38m",
  "items": [
    {
      "index": 1,
      "status": "available",
      "grantedAt": "2026-06-20T20:38:07Z",
      "expiresAt": "2026-07-20T20:38:07Z",
      "expirationDate": "Monday 20 July 2026",
      "expiresIn": "7d 4h 38m"
    },
    {
      "index": 2,
      "status": "available",
      "grantedAt": "2026-06-27T20:38:07Z",
      "expiresAt": "2026-07-27T20:38:07Z",
      "expirationDate": "Monday 27 July 2026",
      "expiresIn": "14d 4h 38m"
    }
  ],
  "warnings": []
}
```

## Doctor document

`codex-limits doctor --json` returns this shape:

```ts
type AgentIntegrationStatus = "installed" | "not-installed" | "unknown";

interface DoctorJson {
  packageVersion: string;
  nodeVersion: string;
  operatingSystem: string;
  codexHomeDetected: boolean;
  authenticationFound: boolean;
  localUsageFound: boolean;
  liveEndpoint: "not-checked" | "reachable" | "unreachable";
  agentIntegrations: Record<string, AgentIntegrationStatus>;
}
```

Sanitized example ([see the JSON example](../examples/codex-limits-doctor-output.example.json)):

<!-- validated-example: codex-limits-doctor-output.example.json -->

```json
{
  "packageVersion": "1.1.0",
  "nodeVersion": "22.0.0",
  "operatingSystem": "Windows",
  "codexHomeDetected": true,
  "authenticationFound": true,
  "localUsageFound": true,
  "liveEndpoint": "reachable",
  "agentIntegrations": {
    "opencode": "installed",
    "pi": "installed",
    "copilot": "installed"
  }
}
```

`authenticationFound` means complete credentials were discovered; it never exposes or serializes those values. `localUsageFound` means at least one recognized local usage window was read. `liveEndpoint` is `not-checked` when authentication is unavailable, `reachable` when the endpoint returns an HTTP response, and `unreachable` for invalid endpoint configuration, timeouts, or network failures. `agentIntegrations` maps every registered agent ID to its bounded installation check; a value is `unknown` only when that adapter cannot safely determine its state.

## Field reference

### Usage windows

| Field              | Meaning                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| `label`            | Stable human-readable window label.                                            |
| `remainingPercent` | Remaining capacity from `0` to `100`, or `null` when unknown.                  |
| `usedPercent`      | Used capacity from `0` to `100`, or `null` when unknown.                       |
| `resetsAt`         | Reset timestamp normalized to an ISO 8601 UTC string, or `null`.               |
| `resetsIn`         | Compact non-negative duration such as `2d 1h 40m`, without seconds, or `null`. |

A whole window is `null` when no recognized data exists for it. When a window is partially available, unknown fields remain present with `null` values. Percentages are clamped to `0`–`100` and rounded to at most one decimal place. When no reset timestamp is available, fallback `resetsIn` text is accepted only in compact `d`, `h`, `m`, and `s` form and is normalized without seconds; unrecognized free-form text is discarded.

For comparisons and stored data, prefer canonical fields such as `resetsAt` and `expiresAt`. Human-readable fields such as `resetsIn`, `expirationDate`, and `expiresIn` are calculated when the command runs and may depend on the machine's local timezone.

### Coupon summary

| Field                | Meaning                                                                              |
| -------------------- | ------------------------------------------------------------------------------------ |
| `available`          | Available reset-credit count as a non-negative integer, or `null` when not returned. |
| `earnedThisPeriod`   | Total earned reset credits as a non-negative integer, or `null`.                     |
| `nextExpirationDate` | Local calendar date for the next available coupon, or otherwise the soonest coupon.  |
| `nextExpirationIn`   | Compact non-negative duration until that expiration.                                 |
| `items`              | Valid coupon entries sorted by expiration time.                                      |
| `warnings`           | Safe coupon-specific availability or payload warnings.                               |

Coupon `index` values are one-based and assigned after sorting. `grantedAt` and `expiresAt` preserve bounded RFC 3339 timestamp strings from the service. `expirationDate` is rendered in the machine's local timezone as `Weekday D Month YYYY`; `expiresIn` is calculated at command execution time. Coupon entries with malformed or extra timestamp text are omitted and produce a warning.

The complete limits contract permits `coupons: null` when a core caller intentionally omits coupon loading. The standard `codex-limits --json` command requests coupons and normally returns a coupon summary object, including an unavailable summary when credentials or network data are missing.

## Contract stability

The documented field names and value types form the public JSON contract. Consumers should tolerate `null` values and additional warning messages.

Existing fields are not removed, renamed, or assigned incompatible types without being documented as a breaking change. New additive fields may be introduced in a future schema revision, so consumers should update the schema they use when adopting a newer contract version. Human-readable labels and warning text should not be used as stable identifiers.

## Warnings and unavailable data

Unavailable values are represented predictably with `null`, empty arrays, and safe warning strings rather than omitted fields. For example, unavailable coupon data has null summary values and an empty `items` array:

```json
{
  "available": null,
  "earnedThisPeriod": null,
  "nextExpirationDate": null,
  "nextExpirationIn": null,
  "items": [],
  "warnings": [
    "Live reset coupons require a readable Codex auth.json file or CODEX_LIMITS_ACCESS_TOKEN and CODEX_LIMITS_ACCOUNT_ID."
  ]
}
```

The top-level `warnings` array combines usage and coupon warnings. `coupons.warnings` contains coupon warnings specifically, so a coupon warning can also appear in the combined list.

## Deliberately omitted fields

The public JSON contract does not expose internal availability statuses or source metadata. In particular, it omits:

- internal availability statuses;
- `usageSource`;
- coupon `source` labels and endpoint URLs;
- opaque reset-coupon IDs and reset types used internally for confirmed redemption;
- access tokens and account IDs;
- authorization headers, cookies, raw local files, and private paths.

Warnings pass through the shared redaction layer before serialization. Raw exceptions are replaced with fixed operation errors.

## Script examples

Read the weekly remaining percentage with `jq`:

```bash
codex-limits --json | jq '.windows.weekly.remainingPercent'
```

Read the available coupon count:

```bash
codex-limits coupons --json | jq '.available'
```

Check whether the live usage endpoint is reachable:

```bash
codex-limits doctor --json | jq -e '.liveEndpoint == "reachable"'
```

Fail a shell script when the CLI fails, while keeping standard output machine-readable:

```bash
if ! limits_json="$(codex-limits --json)"; then
  echo "Could not read Codex limits" >&2
  exit 1
fi

printf '%s\n' "$limits_json" | jq '.windows'
```

Consumers should tolerate `null` values and warning entries. Parse fields as JSON data instead of depending on pretty-print whitespace or terminal-oriented text.

## Related documentation

- [Complete limits example](../examples/codex-limits-output.example.json) and [schema](../schema/codex-limits.schema.json) — Resources for `codex-limits --json`.
- [Coupon example](../examples/codex-limits-coupons-output.example.json) and [schema](../schema/codex-limits-coupons.schema.json) — Resources for `codex-limits coupons --json`.
- [Doctor example](../examples/codex-limits-doctor-output.example.json) and [schema](../schema/codex-limits-doctor.schema.json) — Resources for `codex-limits doctor --json`.
- [Compatibility](compatibility.md) — Runtime, operating system, local-data, terminal, and network requirements.
- [Agent integrations](agent-integrations.md) — Installation, architecture, behavior, and development of supported agent integrations.
- [Troubleshooting](troubleshooting.md) — Diagnosis for JSON output, automation, and data availability problems.
- [Documentation hub](../README.md) — Task-oriented index for CLI, automation, agent, development, and security guides.
- [Project README](../../README.md) — Product overview, installation, commands, and configuration.
