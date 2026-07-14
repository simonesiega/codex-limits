<h1 align="center">
  <img src="docs/photos/logo/title-animation.svg" alt="Codex Limits" width="1040" />
</h1>

<p align="center">
  A polished terminal dashboard for checking Codex usage limits, reset times, and reset-credit coupons.
</p>

<p align="center">
  <a href="https://github.com/simonesiega/codex-limits/stargazers"><img src="https://img.shields.io/github/stars/simonesiega/codex-limits?style=social" alt="GitHub stars" /></a>
  <a href="https://github.com/simonesiega/codex-limits/issues"><img src="https://img.shields.io/github/issues/simonesiega/codex-limits" alt="Open issues" /></a>
  <a href="https://github.com/simonesiega/codex-limits/pulls"><img src="https://img.shields.io/github/issues-pr/simonesiega/codex-limits" alt="Open pull requests" /></a>
  <a href="https://github.com/simonesiega/codex-limits/commits/main"><img src="https://img.shields.io/github/last-commit/simonesiega/codex-limits" alt="Last commit" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/simonesiega/codex-limits" alt="License" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@simonesiega/codex-limits?label=npm" alt="npm version" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Bun-toolchain-black?logo=bun" alt="Bun toolchain" />
</p>

## Preview 🚀

<p align="center">
  <img src="docs/photos/terminal/final_result_large.png" alt="Final codex-limits larger terminal dashboard" width="400" />
  <img src="docs/photos/terminal/final_result_small.png" alt="Final codex-limits smaller terminal dashboard" width="400" />
</p>

The screenshots show the **`codex-limits`** terminal dashboards: clean, read-only TUIs that summarize Codex usage limits and reset-credit coupons in one place. The top section displays the current 5-hour and weekly usage windows with remaining percentages, visual progress bars, and reset times, while the lower section shows available reset coupons, their expiration dates, and the next coupon deadline.

## Contents

- [Quick start](#quick-start)
- [Requirements](#requirements)
- [Overview](#overview)
- [Agent integrations](#agent-integrations)
- [How it works](#how-it-works)
- [Environment](#environment)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
  - [JSON output](docs/readme/json-output.md)
  - [Agent integrations](docs/readme/agent-integrations.md)
  - [Compatibility](docs/readme/compatibility.md)
- [Local development](#local-development)
- [Security](#security)
- [License](#license)
- [Contributors](#contributors)

> Last verified against: `@simonesiega/codex-limits` v0.1.4
> Verification date: 2026-07-14

## Quick start

The package is available on npm as [`@simonesiega/codex-limits`](https://www.npmjs.com/package/@simonesiega/codex-limits) and supports Node.js 20 or newer.

Install **`codex-limits`** globally from npm:

```bash
npm install -g @simonesiega/codex-limits@latest
```

The `@latest` tag ensures you install the latest published version.

Then run it from any terminal:

```bash
codex-limits
```

The list of available commands is shown when you run `codex-limits --help` or in the [Usage](#usage) section.

Install optional agent integrations with their named flag:

```bash
codex-limits init --<agent-name>
```

For example, install the OpenCode integration:

```bash
codex-limits init --opencode
```

## Requirements

| Requirement         | Details                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js             | Node.js 20 or newer is required to run the published CLI. Bun is only required for local development.                                                                                                             |
| Codex               | For normal use, Codex should already be installed and authenticated so `codex-limits` can discover its local data and credentials. Advanced setups can provide supported environment overrides instead.           |
| Operating systems   | Windows, macOS, and Linux are supported through their standard Codex data locations. Use `CODEX_LIMITS_HOME` or `CODEX_HOME` if your data is stored elsewhere.                                                    |
| Internet connection | Local usage fallback can work offline. An internet connection is required for current live usage and reset-credit coupon information; unavailable network data is reported safely without breaking the dashboard. |

## Overview

When you are working with Codex or agent-based coding tools, usage limits can interrupt your flow if you do not know what is left or when the next reset happens.

**`codex-limits`** gives you that information in one clean terminal view. It shows your current 5-hour and weekly usage windows, remaining percentages, progress bars, reset times, and reset-credit coupons when available, so you can quickly check your status and continue coding without leaving the terminal.

It also includes plain-text commands for quick checks, JSON output for scripts and automation, optional agent integrations through `codex-limits init`, and safe output that never prints tokens, account IDs, auth headers, cookies, or raw local files.

## Agent integrations

Optional integrations make Codex limit information available directly inside supported coding agents while reusing the same read-only core and safety model as the CLI.

For installation details, adapter behavior, architecture, and contribution guidance, see the detailed [Agent integrations guide](docs/readme/agent-integrations.md).

### Supported agents

| Agent    | Status    | Agent command   | Guide                                                    | Description                                                                                                     |
| -------- | --------- | --------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| OpenCode | Supported | `/codex-limits` | [Installation and usage](docs/readme/agents/opencode.md) | Opens a fast, read-only Codex limits dashboard directly inside OpenCode without sending the request to the LLM. |

Agent integrations are not enabled automatically during package installation. They must be installed with `codex-limits init` and are only available in the agent terminal after a restart. See [Adding new agents](#adding-new-agents) if you want to add support for another agent.

### Selected agent integration screenshots

#### OpenCode

The OpenCode integration adds a `/codex-limits` command that opens a compact modal inside the agent interface. It gives a quick read-only summary of the current 5-hour limit, weekly limit, and reset-credit coupons, then lets you close the view and return immediately to the conversation.

<p align="center">
  <img src="docs/photos/agents/opencode/opencode_result.png" alt="OpenCode codex-limits integration screenshot" width="740" />
</p>

### Adding new agents

New agents can be added by creating a dedicated adapter under `src/agents/<agent-name>` and registering it in `src/agents/index.ts`. Each integration should keep the same goal: show Codex limit information quickly, safely, and without exposing tokens, account IDs, cookies, auth headers, or raw local files.

See the [Contributing](./CONTRIBUTING.md) guide if you want to add support for another agent.

## How it works

**`codex-limits`** is built around a shared core with different output surfaces on top of it.

| Area               | Path                   | Purpose                                                                                                                                           |
| ------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI entry          | `src/package/cli.ts`   | Starts the `codex-limits` command and routes to the dashboard, plain-text commands, JSON output, and `init`.                                      |
| Core logic         | `src/package/core`     | Detects Codex data, reads local usage, fetches optional live information, normalizes usage windows, and keeps sensitive values out of the output. |
| CLI commands       | `src/package/commands` | Handles the dashboard, `status`, `coupons`, `--json`, and `init` commands.                                                                        |
| Terminal UI        | `src/package/tui`      | Renders the clean Ink-based dashboard from normalized usage data.                                                                                 |
| Agent integrations | `src/agents`           | Contains optional coding-agent adapters that users install with `codex-limits init`.                                                              |
| Tests              | `tests`                | Contains the test suite used to validate core behavior, CLI output, safety rules, and integration logic.                                          |

This structure keeps the project easy to extend: the core decides what the data means, while the CLI, TUI, and agents only decide how that information is shown.

## Environment

**`codex-limits`** works out of the box when it can find the required Codex data automatically. By default, it tries to detect the local Codex data directory and discover the information needed to show usage limits and reset-credit coupons. Most users do not need to configure anything manually.

Environment variables are only used as a fallback when automatic discovery is not enough, or when you want to override the default behavior.

| Variable                      | Purpose                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `CODEX_LIMITS_HOME`           | Overrides the local Codex data directory before all other candidates.                    |
| `CODEX_HOME`                  | Uses Codex's native home override when `CODEX_LIMITS_HOME` is not set.                   |
| `CODEX_LIMITS_ACCESS_TOKEN`   | Provides an access token for authenticated live usage and reset-credit requests.         |
| `CODEX_LIMITS_ACCOUNT_ID`     | Provides the account ID paired with `CODEX_LIMITS_ACCESS_TOKEN`.                         |
| `CODEX_LIMITS_USAGE_ENDPOINT` | Overrides the live usage endpoint with HTTPS or loopback HTTP for advanced setups/tests. |
| `CODEX_LIMITS_SKIP_INIT`      | Suppresses optional global-install setup guidance from the non-interactive postinstall.  |

### Data access and safety

Local Codex data is inspected read-only with bounded file, directory, JSONL, and response limits. Credentials, raw files, and private paths are excluded from public output. Live requests require HTTPS, except for loopback HTTP during local testing. See [`SECURITY.md`](./SECURITY.md#local-data-and-network-behavior) for the complete data-access and network-safety model.

## Usage

| Command                       | Description                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `codex-limits`                | Opens the interactive terminal dashboard.                      |
| `codex-limits status`         | Prints a plain usage summary.                                  |
| `codex-limits coupons`        | Prints reset-credit coupon information.                        |
| `codex-limits coupons --json` | Prints machine-readable reset-credit coupon data only.         |
| `codex-limits --json`         | Prints machine-readable usage and coupon data.                 |
| `codex-limits init`           | Prompts for optional agent integrations in an interactive TTY. |

### `init` options

Use `codex-limits init` to install optional agent integrations. Installation only updates the selected agent configuration; it does not send a prompt to an LLM or modify Codex data.

| Command                                              | What it does                                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `codex-limits init`                                  | Prompts for every supported integration when stdin and stdout are interactive terminals. If no integration is selected, nothing is installed. |
| `codex-limits init --help` or `codex-limits init -h` | Prints the `init` command help without changing any configuration.                                                                            |
| `codex-limits init --all`                            | Installs every supported integration without prompting.                                                                                       |
| `codex-limits init --opencode`                       | Installs only the OpenCode integration, which adds `/codex-limits` to OpenCode.                                                               |
| `codex-limits init --<agent-name>`                   | Installs only the named supported integration. Replace `<agent-name>` with an integration listed in [Supported agents](#supported-agents).    |

`--all` cannot be combined with a named integration flag. Duplicate, unknown, and positional arguments are rejected. In a non-interactive terminal, use `--all` or a named integration flag instead of running `codex-limits init` without options.

## Troubleshooting

### No Codex data found

Make sure Codex has been run and authenticated at least once. If its data is stored outside the standard location, set `CODEX_LIMITS_HOME` or `CODEX_HOME` to the Codex data directory, then run `codex-limits status` again.

### Usage information unavailable

Run `codex-limits status` to view the safe warning summary. Confirm that Codex authentication is current and that the machine can reach the ChatGPT Codex service. Local session data may still provide a fallback when live usage is unavailable; coupon information requires an internet connection.

### Permission errors

Confirm that your user can read the selected Codex directory and its session files. Do not run the CLI with elevated privileges unless your Codex installation explicitly requires it. Prefer correcting the directory permissions or selecting the correct directory with `CODEX_LIMITS_HOME`.

### Agent command not appearing after initialization

Run the named initializer again, for example `codex-limits init --opencode`, and confirm that it reports the integration as installed or already installed. Restart the target agent terminal so it reloads its configuration. If the command is still missing, verify that the displayed configuration paths belong to the agent installation you are using.

## Documentation

The README provides an overview of the main features, commands, and configuration options. For more detailed technical information, see the following guides:

- [JSON output](docs/readme/json-output.md) — Learn about the machine-readable output format, available fields, warnings, examples, and scripting behavior.
- [Agent integrations](docs/readme/agent-integrations.md) — Learn how agent integrations work, how they are installed, and how to develop and contribute new agent adapters.
- [Compatibility](docs/readme/compatibility.md) — View the supported operating systems, Node.js versions, terminals, Codex environments, and agent versions.

## Local development

Clone the repository, install dependencies, and run the CLI locally:

```bash
git clone https://github.com/simonesiega/codex-limits.git
cd codex-limits
bun install
bun run dev
```

Useful development commands:

| Command                | Description                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `bun run dev`          | Runs the CLI in development mode.                                               |
| `bun run check`        | Runs formatting, documentation, types, tests, builds, and package smoke checks. |
| `bun run docs:link`    | Checks local documentation links and heading anchors.                           |
| `bun run docs:schema`  | Validates the JSON Schema and its example output.                               |
| `bun run docs:check`   | Runs both documentation checks.                                                 |
| `bun test`             | Runs the test suite.                                                            |
| `bun run build`        | Builds the package.                                                             |
| `bun run format`       | Formats the repository with Prettier.                                           |
| `bun run format:check` | Checks formatting without changing files.                                       |

## Security

| Operation             | Reads                                           | Writes                            | Network                         |
| --------------------- | ----------------------------------------------- | --------------------------------- | ------------------------------- |
| `codex-limits`        | Recognized Codex state and bounded session data | Nothing                           | Live usage and coupon endpoints |
| `status` / `coupons`  | Shared read-only core                           | Nothing                           | When live data is requested     |
| `init --<agent-name>` | Selected agent configuration                    | Adds the integration registration | Does not send an LLM prompt     |

For vulnerability reports and local data safety details, see [`SECURITY.md`](./SECURITY.md).

## License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE).

## Contributors

<p align="center">
  <a href="https://github.com/simonesiega/codex-limits/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=simonesiega/codex-limits&max=24&columns=12" alt="Contributors" />
  </a>
</p>
