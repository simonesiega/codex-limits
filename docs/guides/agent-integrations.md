# Agent integrations

[← Documentation hub](../README.md) · [Project README](../../README.md)

This page is the central index for supported agent integrations. Each agent has a dedicated guide covering installation, usage, removal, troubleshooting, and links to compatibility requirements.

`codex-limits` can expose the shared, read-only limits dashboard inside supported coding agents. Integrations remain thin and load normalized data through the same core as the CLI.

## Installing an integration

Install the CLI first:

```bash
npm install -g @simonesiega/codex-limits@latest
```

Then choose one of the setup modes:

```bash
# Prompt for each supported integration in an interactive terminal
codex-limits agents install

# Install one or more integrations directly, including in non-interactive terminals
codex-limits agents install <agent...>

# Install every supported integration
codex-limits agents install --all

# Show the agent-management commands or installation help
codex-limits agents --help
codex-limits agents install --help
```

Replace `<agent>` with an identifier from the [Agents](#agents) table. `--all` cannot be combined with agent names. Unknown or duplicate names, unknown options, and extra positional arguments are rejected before any integration is installed. In a non-interactive terminal, provide at least one agent name or `--all`.

The existing `codex-limits init`, `codex-limits init --<agent-name>`, and `codex-limits init --all` forms remain supported as compatibility syntax and use the same installation flow.

After a successful installation, restart the target agent terminal so it reloads its configuration.

## Uninstalling an integration

Removal uses the same target model as installation:

```bash
# Prompt only for integrations currently recognized as installed
codex-limits agents uninstall

# Uninstall one or more integrations directly
codex-limits agents uninstall <agent...>

# Attempt safe removal for every registered integration
codex-limits agents uninstall --all

# Show removal help
codex-limits agents uninstall --help
```

Named and `--all` forms work non-interactively; without either form, removal requires an interactive terminal. An empty interactive selection keeps every integration installed. As with installation, `--all` cannot be combined with names, and invalid names, options, or extra arguments are rejected before configuration changes begin.

An absent integration reports `not installed` as a successful no-op. With multiple targets, each result is reported even when another integration fails. Removal is conservative: each integration changes only configuration it recognizes as Codex Limits-owned, refuses malformed or symbolic-link targets, and preserves unrelated plugins, packages, extension files, and settings. Restart affected agent terminals after removal.

## Agents

Each agent name links to its dedicated installation, usage, removal, compatibility, and troubleshooting guide.

| Agent                                   | Official page                                               | Status    | Command         | Lifecycle target |
| --------------------------------------- | ----------------------------------------------------------- | --------- | --------------- | ---------------- |
| [OpenCode](agents/opencode.md)          | [opencode.ai](https://opencode.ai/)                         | Supported | `/codex-limits` | `opencode`       |
| [pi](agents/pi.md)                      | [pi.dev](https://pi.dev/)                                   | Supported | `/codex-limits` | `pi`             |
| [GitHub Copilot CLI](agents/copilot.md) | [github/copilot-cli](https://github.com/github/copilot-cli) | Supported | `/codex-limits` | `copilot`        |

## Shared behavior and privacy

Every `/codex-limits` integration displays the same compact summary:

- remaining capacity and status for the weekly window;
- the 5-hour window when supplied by Codex;
- reset durations;
- available reset credits and the next expiration;
- safe warnings when some data is unavailable.

Agent integrations are read-only views over the shared local core. They do not receive reset capabilities or send the command or limits data to the LLM. The Security policy is canonical for [agent data flow and installer safeguards](../../SECURITY.md#agent-integrations-and-installers) and [command safety boundaries](../../SECURITY.md#command-safety-boundaries).

Agent adapters must reuse the shared core rather than independently reading Codex data, resolving credentials, making live requests, or defining safety rules.

## Adding another agent

Agent integrations use thin host-specific adapters over the shared core and lifecycle infrastructure. Contributors should follow the complete [Adding a new agent](../../CONTRIBUTING.md#adding-a-new-agent) implementation checklist.

## Related documentation

- [Compatibility](compatibility.md) — Canonical runtime, operating-system, terminal, network, and agent support requirements.
- [JSON output](json-output.md) — Machine-readable output, fields, warnings, and scripting behavior.
- [Contributing](../../CONTRIBUTING.md#adding-a-new-agent) — Complete checklist for developing and submitting another agent adapter.
- [Security policy](../../SECURITY.md) — Local-data safeguards, network behavior, and vulnerability reporting.
- [Troubleshooting](troubleshooting.md) — Cross-surface diagnosis and links to agent-specific problem resolution.
- [Documentation hub](../README.md) — Task-oriented index for CLI, automation, agent, development, and security guides.
- [Project README](../../README.md) — Product overview, installation, commands, and configuration.
