<h1 align="center">
  <img src="docs/assets/logo/title-animation.svg" alt="Codex Limits" width="650" />
</h1>

<p align="center">
  <strong>Monitor OpenAI Codex usage limits, reset times, and reset credits directly from your terminal.</strong>
</p>

<p align="center">
  <a href="#requirements">Requirements</a> · <a href="#quick-start">Installation</a> · <a href="#usage">Commands</a> · <a href="docs/README.md">Documentation</a> · <a href="CONTRIBUTING.md#finding-work">Contributing</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@simonesiega/codex-limits"><img src="https://img.shields.io/npm/v/@simonesiega/codex-limits?label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@simonesiega/codex-limits"><img src="https://img.shields.io/npm/dt/@simonesiega/codex-limits?label=total%20downloads" alt="Total npm downloads" /></a>
  <a href="https://github.com/simonesiega/codex-limits/actions/workflows/check.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/simonesiega/codex-limits/check.yml?branch=main&amp;label=tests" alt="Automated test status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/simonesiega/codex-limits" alt="License" /></a>
  <a href="https://codecov.io/gh/simonesiega/codex-limits"><img src="https://codecov.io/gh/simonesiega/codex-limits/branch/main/graph/badge.svg" alt="Code coverage" /></a>
</p>

<p align="center">
  <img src="docs/assets/terminal/promotional-demo.gif" alt="Animated Codex Limits terminal dashboard showing usage windows and reset credits" width="100%" />
</p>

## Overview

**Codex Limits** provides a fast, read-only view of the Codex usage windows currently available to your account, including remaining capacity, reset times, and reset credits. It keeps the information in your terminal so you can check it without interrupting your coding flow.

The `codex-limits` CLI includes an interactive dashboard, plain-text commands, stable JSON output, safe diagnostics, optional agent integrations, and one explicitly confirmed command for redeeming a reset credit. Sensitive credentials, account IDs, private paths, and raw local files are excluded from public output.

## Quick start

Install the published npm package globally:

```bash
npm install -g @simonesiega/codex-limits@latest
```

Open the dashboard:

```bash
codex-limits
```

For a quick non-interactive check, run:

```bash
codex-limits status
```

## Requirements

The published CLI requires Node.js 20 or newer. It supports Windows, macOS, and Linux and discovers existing Codex authentication and usage data automatically when available.

See [Compatibility](docs/guides/compatibility.md) for the canonical runtime, installation, platform, Codex-data, terminal, network, and agent-host requirements.

## Usage

| Command                                       | Description                                           |
| --------------------------------------------- | ----------------------------------------------------- |
| `codex-limits`                                | Opens the interactive terminal dashboard.             |
| `codex-limits status`                         | Prints a plain usage summary.                         |
| `codex-limits status --threshold <condition>` | Checks a remaining-usage threshold for automation.    |
| `codex-limits coupons`                        | Prints available reset credits.                       |
| `codex-limits coupons --json`                 | Prints machine-readable reset-credit data.            |
| `codex-limits reset <coupon-index>`           | Reviews and redeems the selected reset credit.        |
| `codex-limits reset --soonest`                | Reviews and redeems the credit that expires first.    |
| `codex-limits --json`                         | Prints machine-readable usage and reset-credit data.  |
| `codex-limits doctor`                         | Prints safe environment and connectivity diagnostics. |
| `codex-limits doctor --json`                  | Prints machine-readable diagnostics.                  |
| `codex-limits completions <shell>`            | Generates completions for five supported shells.      |
| `codex-limits agents`                         | Shows agent integration management commands.          |
| `codex-limits agents install <agent...>`      | Installs one or more named agent integrations.        |
| `codex-limits agents install --all`           | Installs every supported agent integration.           |
| `codex-limits agents uninstall <agent...>`    | Removes one or more recognized agent integrations.    |
| `codex-limits agents uninstall --all`         | Removes every recognized agent integration.           |
| `codex-limits init`                           | Runs the compatible integration installation flow.    |

Run `codex-limits --help` or a command-specific `--help` option for generated CLI help.

### Reset credits

`codex-limits reset` is the only remote-mutation command. It refreshes reset-credit data, displays a recap, and proceeds only in an interactive terminal after an explicit `y` or `yes`. See [Command safety boundaries](SECURITY.md#command-safety-boundaries) for the canonical safety behavior.

### Diagnostics and automation

Start troubleshooting with the read-only diagnostic command:

```bash
codex-limits doctor
```

For automation, use `codex-limits --json`, `codex-limits coupons --json`, or `codex-limits doctor --json`. Usage checks can repeat `--threshold five-hour=<percent>` or `--threshold weekly=<percent>` on `status` or the root JSON command to receive deterministic exit codes without changing output. Their contracts, threshold exit codes, schemas, and sanitized examples are documented in [JSON output](docs/guides/json-output.md).

### Shell completions

Generate a completion script for Bash, Zsh, Fish, PowerShell, or Nushell:

```text
codex-limits completions <shell>
```

See [Shell completions](docs/guides/shell-completions.md) for installation steps and an explanation of how registry-driven generation works.

## Agent integrations

Codex Limits can expose the same local, read-only summary inside supported coding agents. Integrations are optional, do not receive reset capabilities, and must be installed separately.

| Agent              | Agent command   | Install command                        | Guide                                                      |
| ------------------ | --------------- | -------------------------------------- | ---------------------------------------------------------- |
| OpenCode           | `/codex-limits` | `codex-limits agents install opencode` | [OpenCode setup and usage](docs/guides/agents/opencode.md) |
| pi                 | `/codex-limits` | `codex-limits agents install pi`       | [pi setup and usage](docs/guides/agents/pi.md)             |
| GitHub Copilot CLI | `/codex-limits` | `codex-limits agents install copilot`  | [Copilot setup and usage](docs/guides/agents/copilot.md)   |

Restart the agent after installation or removal so it reloads its configuration. Shared lifecycle modes, safety boundaries, and integration architecture are documented in the [Agent integrations guide](docs/guides/agent-integrations.md).

## How it works

Codex Limits keeps shared behavior centralized and exposes it through focused output surfaces:

| Area               | Path                   | Responsibility                                                          |
| ------------------ | ---------------------- | ----------------------------------------------------------------------- |
| CLI entry          | `src/package/cli.ts`   | Starts `codex-limits` and delegates to the command registry.            |
| Core               | `src/package/core`     | Discovery, normalization, authenticated reads, warnings, and redaction. |
| Commands           | `src/package/commands` | CLI parsing, help, safety categories, and command orchestration.        |
| Terminal UI        | `src/package/tui`      | Rendering normalized data with Ink.                                     |
| Agent integrations | `src/agents`           | Thin host-specific installation and read-only presentation layers.      |
| Tests              | `tests`                | Behavior, output, safety, and integration coverage.                     |

The supported public interfaces are the CLI, its documented JSON contracts, and the agent-host package exports described in [Compatibility](docs/guides/compatibility.md#runtime-and-installation). The internal core is not a public JavaScript API.

## Documentation

See the [documentation hub](docs/README.md) for compatibility, troubleshooting, JSON contracts, shell completions, agent integrations, security, and contributor documentation.

## Local development

```bash
git clone https://github.com/simonesiega/codex-limits.git
cd codex-limits
bun install
bun run dev
```

Use Bun for repository development. See [Contributing](CONTRIBUTING.md#local-development) for the full development and validation workflow.

## Security

Inspection commands are read-only. Agent lifecycle commands write only recognized host configuration, and reset credit redemption is isolated behind explicit interactive confirmation. See [`SECURITY.md`](SECURITY.md) for data-access safeguards, command boundaries, and private vulnerability reporting.

## License

Codex Limits is licensed under the [MIT License](LICENSE).

## Contributors

<p align="center">
  <a href="https://github.com/simonesiega/codex-limits/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=simonesiega/codex-limits&amp;max=24&amp;columns=12" alt="Contributors" />
  </a>
</p>
