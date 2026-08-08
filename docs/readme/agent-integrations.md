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

Replace `<agent>` with an identifier from the [Agents](#agents) table. `--all` cannot be combined with agent names. Unknown or duplicate names and unknown options are rejected before any integration is installed.

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

Named and `--all` forms work non-interactively. An absent integration reports `not installed` as a successful no-op. With multiple targets, each result is reported even when another adapter fails. Removal is conservative: each adapter changes only configuration it recognizes as Codex Limits-owned, refuses malformed or symbolic-link targets, and preserves unrelated plugins, packages, extension files, and settings. Restart affected agent terminals after removal.

## Agents

Each agent name links to its dedicated installation, usage, removal, compatibility, and troubleshooting guide.

| Agent                                   | Official page                                               | Status    | Command         | Lifecycle target |
| --------------------------------------- | ----------------------------------------------------------- | --------- | --------------- | ---------------- |
| [OpenCode](agents/opencode.md)          | [opencode.ai](https://opencode.ai/)                         | Supported | `/codex-limits` | `opencode`       |
| [pi](agents/pi.md)                      | [pi.dev](https://pi.dev/)                                   | Supported | `/codex-limits` | `pi`             |
| [GitHub Copilot CLI](agents/copilot.md) | [github/copilot-cli](https://github.com/github/copilot-cli) | Supported | `/codex-limits` | `copilot`        |

## Data and privacy

Agent integrations are read-only views over the shared local core. The Security policy is canonical for [agent data flow and installer safeguards](../../SECURITY.md#agent-integrations-and-installers) and [command safety boundaries](../../SECURITY.md#command-safety-boundaries).

Agent adapters must reuse the shared core rather than independently reading Codex data, resolving credentials, making live requests, or defining safety rules.

## Adding another agent

Agent adapters live under `src/agents/<agent-name>` and use one consistent layout:

```text
src/agents/<agent-name>/
├── format.ts       # Thin host-facing wrapper over shared presentation
├── install.ts      # Bounded configuration install, uninstall, and inspection
├── integration.ts  # Metadata plus lifecycle/inspection registration contract
└── plugin.ts       # Host API adapter that loads the shared core
```

Register the exported descriptor once in `src/agents/index.ts`. Shared install and uninstall commands, generated compatibility help, and doctor diagnostics consume that registry automatically. Every registered agent must also use a matching `src/package/<agent-name>.ts` wrapper and expose `@simonesiega/codex-limits/<agent-name>` through the shared package-entry build and declaration flow. Put behavior used by multiple agents in `src/agents/shared` rather than duplicating it.

New adapters should remain thin, reuse `src/package/core`, avoid sending the request or limit data to the LLM, and include installer, formatter, and host-behavior tests. Each supported integration should also have a dedicated guide under `docs/readme/agents/<agent-name>.md` and an entry in the [Agents](#agents) table.

See [Contributing](../../CONTRIBUTING.md#adding-a-new-agent) for the complete contribution checklist.

## Related documentation

- [Compatibility](compatibility.md) — Canonical runtime, operating-system, terminal, network, and agent support requirements.
- [JSON output](json-output.md) — Machine-readable output, fields, warnings, and scripting behavior.
- [Contributing](../../CONTRIBUTING.md#adding-a-new-agent) — Complete checklist for developing and submitting another agent adapter.
- [Security policy](../../SECURITY.md) — Local-data safeguards, network behavior, and vulnerability reporting.
- [Troubleshooting](troubleshooting.md) — Cross-surface diagnosis and links to agent-specific problem resolution.
- [Documentation hub](../README.md) — Task-oriented index for CLI, automation, agent, development, and security guides.
- [Project README](../../README.md) — Product overview, installation, commands, and configuration.
