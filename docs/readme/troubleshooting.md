# Troubleshooting

[← Documentation hub](../README.md) · [Project README](../../README.md)

Use this guide when Codex data, live usage, reset-credit coupons, JSON output, the terminal dashboard, reset redemption, or an agent integration is unavailable.

## Contents

- [Start with diagnostics](#start-with-diagnostics)
- [No Codex data found](#no-codex-data-found)
- [Usage information is unavailable](#usage-information-is-unavailable)
- [Reset-credit coupons are unavailable](#reset-credit-coupons-are-unavailable)
- [Authentication overrides are incomplete](#authentication-overrides-are-incomplete)
- [Permission errors](#permission-errors)
- [The dashboard does not render correctly](#the-dashboard-does-not-render-correctly)
- [JSON output or automation fails](#json-output-or-automation-fails)
- [Reset redemption does not proceed](#reset-redemption-does-not-proceed)
- [An agent command does not appear](#an-agent-command-does-not-appear)
- [Agent installation reports invalid or conflicting configuration](#agent-installation-reports-invalid-or-conflicting-configuration)
- [Agent uninstallation refuses a target](#agent-uninstallation-refuses-a-target)
- [The problem persists](#the-problem-persists)
- [Related documentation](#related-documentation)

## Start with diagnostics

Run the read-only diagnostic command first:

```bash
codex-limits doctor
```

For machine-readable diagnostics:

```bash
codex-limits doctor --json
```

Then run `codex-limits status` to see safe usage warnings and `codex-limits coupons` to check coupon availability independently. Diagnostic and warning output intentionally omits credentials, private paths, endpoint URLs, and raw Codex files.

## No Codex data found

1. Run Codex and authenticate at least once.
2. Run `codex-limits doctor` and check **Codex home detected**, **Authentication found**, and **Local usage found**.
3. If Codex stores data outside its standard location, set `CODEX_LIMITS_HOME` or `CODEX_HOME` to the correct directory.
4. Confirm that the selected location is a readable directory rather than a file.
5. Review [Codex data compatibility](compatibility.md#codex-data-compatibility) for recognized data and credential sources.

## Usage information is unavailable

Current usage normally comes from the live Codex endpoint, with compatible local state used as a fallback.

- Confirm that Codex authentication is current.
- Check **Live endpoint** with `codex-limits doctor`.
- Confirm that the machine can reach the ChatGPT Codex service.
- Run Codex again to create a recent local usage snapshot when working offline.
- Check [network compatibility](compatibility.md#network-compatibility) if a proxy, firewall, endpoint override, or offline environment is involved.

A missing 5-hour window is not necessarily an error. Codex may provide only a weekly usage window.

## Reset-credit coupons are unavailable

Coupon information requires complete credentials and network access; it has no local-data fallback.

- Confirm that `authenticationFound` is `true` in `doctor --json`, or that **Authentication found** is **Yes** in text output.
- If using environment credentials, provide both `CODEX_LIMITS_ACCESS_TOKEN` and `CODEX_LIMITS_ACCOUNT_ID`.
- Use the live usage endpoint status as a general connectivity signal, but inspect coupon warnings separately because `doctor` does not call the coupon endpoint.
- Inspect safe warnings from `codex-limits coupons`.

Do not print credential values while troubleshooting.

## Authentication overrides are incomplete

`CODEX_LIMITS_ACCESS_TOKEN` and `CODEX_LIMITS_ACCOUNT_ID` must be supplied together. Providing only one disables authenticated live requests and produces a safe warning. Either provide both values or remove the partial override so the CLI can use a readable Codex `auth.json` file.

## Permission errors

Confirm that your user can read the selected Codex directory and recognized files. Prefer correcting ownership or permissions, or selecting the correct directory with `CODEX_LIMITS_HOME`, instead of running the CLI with elevated privileges.

The CLI intentionally skips unsafe, unreadable, oversized, or symbolic-link entries. See the [Security policy](../../SECURITY.md#local-data-and-network-behavior) for canonical file-handling behavior.

## The dashboard does not render correctly

- Confirm that the command is running in an interactive terminal.
- Resize very narrow or short terminals; the dashboard switches to compact layouts automatically.
- Use `codex-limits status`, `codex-limits coupons`, or JSON output when Ink rendering is unavailable.
- Check [terminal compatibility](compatibility.md#terminal-and-automation-compatibility).

## JSON output or automation fails

Use one of the documented JSON forms:

```bash
codex-limits --json
codex-limits coupons --json
codex-limits doctor --json
```

`status --json` is not supported. Successful JSON is written to standard output; command failures are written to standard error and return a non-zero exit code. Warnings and unavailable nullable fields can still appear in a successful document.

Validate consumers against the schemas and examples linked from [JSON output](json-output.md). Parse JSON fields rather than terminal text or pretty-print whitespace.

## Reset redemption does not proceed

`codex-limits reset` requires both standard input and standard output to be interactive TTYs. It has no unattended or JSON confirmation mode.

- Run `codex-limits coupons` first and confirm that an available coupon is listed.
- Use a displayed coupon index, or `codex-limits reset --soonest` when expiration data is complete.
- Confirm only after reviewing the recap.
- If coupon details are incomplete, availability is inconsistent, or the final response is ambiguous, the command fails closed and does not claim success.

See [Reset redemption](../../SECURITY.md#reset-redemption) for the canonical safety behavior.

## An agent command does not appear

Use the troubleshooting section for the installed agent:

- [OpenCode command troubleshooting](agents/opencode.md#the-command-does-not-appear)
- [pi command troubleshooting](agents/pi.md#the-command-does-not-appear)
- [GitHub Copilot CLI command troubleshooting](agents/copilot.md#the-command-does-not-appear)

In general, rerun the named installer, confirm that it reports **installed** or **already installed**, and restart the agent so it reloads configuration. Agent-specific configuration paths, reload behavior, host requirements, and removal steps remain canonical in each dedicated guide.

## Agent installation reports invalid or conflicting configuration

Installers intentionally refuse malformed, oversized, symbolic-link, or conflicting targets rather than overwriting them. Review the relevant dedicated guide before changing agent configuration:

- [OpenCode setup troubleshooting](agents/opencode.md#setup-reports-invalid-json)
- [pi setup troubleshooting](agents/pi.md#setup-reports-invalid-json)
- [GitHub Copilot CLI extension conflicts](agents/copilot.md#the-extension-path-is-already-in-use)

Do not remove unrelated plugins, packages, extensions, or configuration fields.

## Agent uninstallation refuses a target

Uninstallers intentionally fail closed on malformed, oversized, symbolic-link, unreadable, or unrecognized targets. They do not rewrite or delete the target merely because it occupies an expected path.

1. Run `codex-limits doctor` to review the bounded installed status.
2. Read the removal section for [OpenCode](agents/opencode.md#re-running-or-removing-the-integration), [pi](agents/pi.md#re-running-or-removing-the-integration), or [GitHub Copilot CLI](agents/copilot.md#re-running-or-removing-the-integration).
3. Correct malformed host configuration before retrying.
4. For an unrecognized Copilot entry point, inspect the dedicated extension directory and remove it manually only if you can independently verify its ownership.

With multiple named targets or `--all`, review every per-agent result: one failure does not prevent other adapters from attempting safe removal.

## The problem persists

1. Run `codex-limits doctor` and the affected read-only command again.
2. Record the command, expected behavior, safe status labels, and warning text.
3. Include the operating system and Node.js version, but redact private paths and environment values.
4. Check existing [GitHub issues](https://github.com/simonesiega/codex-limits/issues) before opening a focused report.

For a suspected credential, data-exposure, unsafe-write, or reset-redemption vulnerability, follow the private process in the [Security policy](../../SECURITY.md#reporting-a-vulnerability) instead of opening a public issue.

## Related documentation

- [Compatibility](compatibility.md) — Canonical runtime, operating-system, Codex-data, network, terminal, and agent-host requirements.
- [JSON output](json-output.md) — Machine-readable contracts, schemas, examples, and scripting behavior.
- [Agent integrations](agent-integrations.md) — Supported-agent index and shared lifecycle modes.
- [Security policy](../../SECURITY.md) — Canonical safety behavior and private vulnerability reporting.
- [Documentation hub](../README.md) — Task-oriented documentation index.
- [Project README](../../README.md) — Product overview, installation, and command reference.
