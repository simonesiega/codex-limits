# Compatibility

[← Documentation hub](../README.md) · [Project README](../../README.md)

This page describes the runtime, operating-system, Codex data, network, terminal, and agent compatibility implemented by the current codebase.

## Runtime and installation

| Environment         | Support                                                 |
| ------------------- | ------------------------------------------------------- |
| Published CLI       | Node.js 20 or newer                                     |
| Package format      | ESM, bundled for Node.js                                |
| Global installation | npm (`npm install -g @simonesiega/codex-limits@latest`) |
| Source development  | Bun 1.3.14, as declared in `package.json`               |
| TypeScript target   | ES2022                                                  |

Bun is used for dependency management, tests, development commands, and production builds. It is not required to run the published CLI. Runtime dependencies are bundled into `dist`, so the published package does not declare separate production dependencies.

The root package module resolves to the agent-specific `dist/opencode.js` bundle for OpenCode plugin-loader compatibility. The explicit `@simonesiega/codex-limits/opencode` subpath resolves to the same module; both expose a default plugin and the named `tui` export. The host-only `@simonesiega/codex-limits/pi` subpath resolves to the separate `dist/pi.js` extension also declared in the package's `pi.extensions` manifest. The host-only `@simonesiega/codex-limits/copilot` subpath resolves to the executable `dist/copilot.mjs` extension, which the GitHub Copilot CLI installer also copies to its recognized user extension entry point.

These agent-host exports are not a general-purpose JavaScript API and do not install an integration by themselves. The supported general interfaces are the CLI and its documented [JSON output](json-output.md). There is intentionally no `@simonesiega/codex-limits/core` export; internal core modules may change without a public API compatibility guarantee.

## Tested environments

The following environments are covered by the repository's automated checks or latest recorded local validation. Other compatible environments may also work, but they are not tested for every release.

| Area                             | Tested environments                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Automated packaged CLI           | GitHub Actions on `ubuntu-latest` with Node.js 20 and 22, `windows-latest` with Node.js 20, and `macos-latest` with Node.js 22 |
| Latest recorded local validation | Windows build `10.0.26200.8875` with Node.js 22.20.0 and Bun 1.3.14 (verified 2026-08-08)                                      |
| Terminal rendering               | Automated Ink rendering and layout tests; no named terminal application is included in the per-release test matrix             |
| OpenCode agent adapter           | Mocked current keymap and legacy command API shapes; no exact OpenCode host release is tested end-to-end                       |
| pi agent adapter                 | Mocked command/UI APIs with real TUI components; package discovery validated in pi 0.81.1 print mode                           |
| Copilot CLI adapter              | Mocked SDK command/timeline APIs and packed installation; typed against `@github/copilot-sdk` 1.0.8                            |

The supported runtime and operating-system ranges are broader than this test matrix. Automated checks sample each supported operating system but do not test every supported Node.js version on every platform.

## Operating systems

The CLI supports Windows, macOS, and Linux through Node's cross-platform filesystem and path APIs.

Codex home candidates are checked in this order, skipping missing or unreadable directories and removing duplicates:

1. `CODEX_LIMITS_HOME`
2. `CODEX_HOME`
3. `~/.codex`
4. `~/.config/codex`
5. `~/Library/Application Support/Codex`
6. `~/Library/Application Support/Parall/Codex/.codex`
7. `%APPDATA%/Codex`, when `APPDATA` is available
8. `%LOCALAPPDATA%/Codex`, when `LOCALAPPDATA` is available

`CODEX_LIMITS_HOME` has the highest priority. `CODEX_HOME` is Codex's native override and is used next. Override values must identify readable directories; files and unreadable paths are ignored.

The default home directory is resolved from `HOME`, then `USERPROFILE`, then the operating system's home-directory API.

## Codex data compatibility

For normal use, Codex must have been installed, run, and authenticated at least once. The CLI can use:

- live weekly usage and, when supplied, 5-hour usage from the ChatGPT Codex usage endpoint;
- bounded local `sessions/**/rollout-*.jsonl` data as a usage fallback;
- recognized bounded JSON state files as an additional local fallback;
- `auth.json` in the detected Codex home for live request credentials;
- the paired `CODEX_LIMITS_ACCESS_TOKEN` and `CODEX_LIMITS_ACCOUNT_ID` variables when automatic credential discovery is unavailable.

Both credential environment variables are required together. Supplying only one produces an incomplete-authentication warning and does not initiate an authenticated request.

Local Codex data is inspected read-only. See the [Security policy](../../SECURITY.md#local-data-and-network-behavior) for the canonical traversal, redaction, and file-handling safeguards.

Local state layouts can vary between Codex versions. The parser recognizes common primary/five-hour and secondary/weekly window names and can return partial data when only some fields are understood. For live responses, declared window durations such as `limit_window_seconds` take precedence over legacy primary/secondary slot names, because the usage service can now return weekly usage in `primary_window` without a 5-hour window.

## Network compatibility

Live data uses these defaults:

| Data                 | Endpoint                                                                | Offline behavior                    |
| -------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| Usage windows        | `https://chatgpt.com/backend-api/codex/usage`                           | Falls back to recognized local data |
| Reset-credit coupons | `https://chatgpt.com/backend-api/wham/rate-limit-reset-credits`         | Reported as unavailable             |
| Coupon redemption    | `https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume` | Never attempted automatically       |

These endpoints are implementation details rather than a public API contract and may change when Codex changes its service behavior. A response containing only a recognized weekly window is treated as valid live usage; local discovery is used only when the live response contains no recognized usage window.

Requests require complete Codex credentials and use a 10-second timeout by default. The runtime's `fetch` implementation and native Node HTTP/HTTPS transport are both supported. See the [Security policy](../../SECURITY.md#local-data-and-network-behavior) for canonical request, response, endpoint, timestamp, and redemption safeguards.

`CODEX_LIMITS_USAGE_ENDPOINT` can override only the live usage endpoint. Supported overrides use HTTPS, with plain HTTP limited to loopback testing on `localhost`, `127.0.0.1`, or `::1`.

An internet connection is therefore recommended for current usage and required for coupon data. The CLI remains usable offline when compatible local usage snapshots exist.

## Terminal and automation compatibility

| Surface                        | Requirement                                                |
| ------------------------------ | ---------------------------------------------------------- |
| Interactive dashboard          | A terminal capable of running the Ink UI                   |
| `status` and `coupons`         | Any environment that can capture standard output           |
| JSON output                    | Any environment that can capture and parse standard output |
| Reset coupon redemption        | Both standard input and standard output must be TTYs       |
| Interactive agent installation | Both standard input and standard output must be TTYs       |
| Explicit agent installation    | Works non-interactively with an agent name or `--all`      |

Use [`codex-limits --json`](json-output.md), `codex-limits coupons --json`, or `codex-limits doctor --json` in scripts. Errors use a non-zero exit code and are written to standard error; successful machine-readable output is written to standard output. `codex-limits reset` is intentionally interactive and has no JSON or unattended confirmation mode.

## OpenCode compatibility

The integration supports OpenCode hosts that expose either the current keymap layer registration API or the legacy command registration API. Compatibility is detected from the runtime API shape rather than an exact version list. Automated adapter tests cover both shapes; no named OpenCode release is currently tested end-to-end.

See the [OpenCode integration guide](agents/opencode.md) for canonical installation, configuration, removal, and troubleshooting instructions.

## pi compatibility

The extension is developed against `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` 0.81.x, which require Node.js 22.19 or newer. Those optional peers are supplied by the pi host and do not change the standalone CLI's Node.js 20 requirement.

Local validation confirmed package discovery and command interception with pi 0.81.1 in print mode. Automated tests cover the interactive overlay with host mocks and real TUI components; the overlay is not terminal-tested against every pi release.

See the [pi integration guide](agents/pi.md) for canonical installation, configuration, removal, and troubleshooting instructions.

## GitHub Copilot CLI compatibility

The integration depends on Copilot CLI's experimental extension mechanism, which may change. npm installations of the current Copilot CLI require Node.js 22 or newer; other official installation methods package the host separately. The host must provide `@github/copilot-sdk/extension` to the extension process.

The adapter is type-checked against `@github/copilot-sdk` 1.0.8. Automated tests cover registration, timeline output, safe failures, and packed installation, but no exact Copilot CLI release is currently tested end-to-end.

See the [GitHub Copilot CLI integration guide](agents/copilot.md) for canonical installation, configuration, removal, and troubleshooting instructions.

## Support policy

The latest npm release is supported. The current `main` branch is supported for unreleased fixes, while older releases receive best-effort support. See the [Security policy](../../SECURITY.md#supported-versions) for security support details.

## Related documentation

- [JSON output](json-output.md) — Machine-readable output, fields, warnings, and scripting behavior.
- [Agent integrations](agent-integrations.md) — Supported-agent index, shared installation modes, and adapter architecture.
- [Security policy](../../SECURITY.md) — Data-access safeguards, network behavior, and vulnerability reporting.
- [Troubleshooting](troubleshooting.md) — Diagnosis for Codex data, network, terminal, reset, and agent problems.
- [Documentation hub](../README.md) — Task-oriented index for CLI, automation, agent, development, and security guides.
- [Project README](../../README.md) — Product overview, installation, commands, and configuration.
