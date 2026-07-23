# JSON output

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

This example represents one snapshot captured at `2026-07-13T16:00:07.000Z` on a system configured for UTC:

```json
{
  "windows": {
    "fiveHour": {
      "label": "5-hour usage limit",
      "remainingPercent": 93,
      "usedPercent": 7,
      "resetsAt": "2026-07-13T19:55:07.000Z",
      "resetsIn": "3h 55m"
    },
    "weekly": {
      "label": "Weekly usage limit",
      "remainingPercent": 11,
      "usedPercent": 89,
      "resetsAt": "2026-07-15T17:40:07.000Z",
      "resetsIn": "2d 1h 40m"
    }
  },
  "coupons": {
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
  },
  "warnings": []
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

Using the same reference time and timezone as the complete example:

```json
{
  "available": 1,
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

Example:

```json
{
  "packageVersion": "0.1.6",
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

A whole window is `null` when no recognized data exists for it. When a window is partially available, unknown fields remain present with `null` values. Percentages are clamped to `0`–`100` and rounded to at most one decimal place.

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

Coupon `index` values are one-based and assigned after sorting. `grantedAt` and `expiresAt` preserve valid timestamp strings from the service. `expirationDate` is rendered in the machine's local timezone as `Weekday D Month YYYY`; `expiresIn` is calculated at command execution time. Malformed coupon entries are omitted and produce a warning.

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

- [Example JSON output](../examples/codex-limits-output.example.json) — Complete example response produced by `codex-limits --json`.
- [JSON Schema](../schema/codex-limits.schema.json) — Machine-readable schema for validating the complete JSON response.
- [Compatibility](compatibility.md) — Runtime, operating system, local-data, terminal, and network requirements.
- [Agent integrations](agent-integrations.md) — Installation, architecture, behavior, and development of supported agent integrations.
- [Project README](../../README.md#documentation) — Installation, commands, configuration, troubleshooting, and the complete documentation index.
