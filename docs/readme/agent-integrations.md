# Agent integrations

This page is the central index for supported agent integrations. Each agent has a dedicated guide covering installation, usage, compatibility, removal, and troubleshooting.

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

## Agents

Each agent name links to its dedicated installation, usage, compatibility, and troubleshooting guide.

| Agent                          | Official page                       | Status    | Command         | Installer                              |
| ------------------------------ | ----------------------------------- | --------- | --------------- | -------------------------------------- |
| [OpenCode](agents/opencode.md) | [opencode.ai](https://opencode.ai/) | Supported | `/codex-limits` | `codex-limits agents install opencode` |

## Data and privacy

All agent integrations run the shared `codex-limits` core locally. They do not send prompts or Codex limit data to an LLM. Tokens, account IDs, authorization headers, cookies, raw local files, and private paths are excluded from displayed output.

Agent adapters must reuse the shared core rather than independently reading Codex data, resolving credentials, making live requests, or defining redaction rules.

## Adding another agent

Agent adapters live under `src/agents/<agent-name>` and are registered in `src/agents/index.ts`. New adapters should remain thin, reuse `src/package/core`, avoid sending limit data to an LLM, and include installation and behavior tests.

Each supported integration should also have a dedicated guide under `docs/readme/agents/<agent-name>.md` and an entry in the [Agents](#agents) table.

See [Contributing](../../CONTRIBUTING.md#adding-a-new-agent) for the complete contribution checklist.

## Related documentation

- [Compatibility](compatibility.md) — Runtime, operating-system, terminal, network, and agent compatibility.
- [JSON output](json-output.md) — Machine-readable output, fields, warnings, and scripting behavior.
- [Contributing](../../CONTRIBUTING.md#adding-a-new-agent) — Complete checklist for developing and submitting another agent adapter.
- [Security policy](../../SECURITY.md) — Local-data safeguards, network behavior, and vulnerability reporting.
- [Project README](../../README.md#documentation) — Installation, commands, configuration, and the complete documentation index.
