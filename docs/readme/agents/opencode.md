# OpenCode integration

[← Documentation hub](../../README.md) · [Agent integrations](../agent-integrations.md) · [Project README](../../../README.md)

The OpenCode integration adds a read-only `/codex-limits` command that loads the shared core locally and displays Codex usage windows, reset times, reset credits, and safe warnings without sending the request or limit data to the LLM.

## Overview

| Detail             | Value                                  |
| ------------------ | -------------------------------------- |
| Agent              | [OpenCode](https://opencode.ai/)       |
| Status             | Supported                              |
| Agent command      | `/codex-limits`                        |
| Install command    | `codex-limits agents install opencode` |
| Installation scope | Global for the current user            |

## Installation

Install the CLI globally, then run the named installer:

```bash
npm install -g @simonesiega/codex-limits@latest
codex-limits agents install opencode
```

The explicit agent name works in interactive and non-interactive terminals. The compatible `codex-limits init --opencode` form remains supported. Restart OpenCode after installation so it reloads its configuration.

### Configuration files

The installer updates both of these global configuration files for the current user:

```text
~/.config/opencode/opencode.json
~/.config/opencode/tui.json
```

It adds the following package to each file's `plugin` array:

```json
"@simonesiega/codex-limits"
```

The package root and the explicit `@simonesiega/codex-limits/opencode` host subpath resolve to the same bundled plugin. The installer uses the root package name for OpenCode plugin-loader compatibility; the subpath is not a separate installation method.

Both files are updated because compatible OpenCode versions discover TUI plugins through different global configuration files. The installer creates missing configuration objects, preserves unrelated fields and plugins, recognizes common package version forms, and avoids duplicate registrations. If one file is already configured and the other is not, only the missing plugin registration is added.

Installer file-handling, size, symbolic-link, atomic-write, and path-redaction guarantees are canonical in the [Security policy](../../../SECURITY.md#agent-integrations-and-installers).

## Using `/codex-limits`

Restart OpenCode after installation, then run:

```text
/codex-limits
```

<p align="center">
  <img
    src="../../photos/agents/opencode/opencode_result.png"
    alt="Codex Limits modal running inside OpenCode"
    width="740"
  />
</p>

OpenCode opens a modal dialog, loads the shared core directly, and displays:

- remaining capacity and status for the weekly window;
- the 5-hour window when it is supplied by the usage service;
- reset durations;
- available reset credits and the next expiration;
- safe warnings when some data is unavailable.

Loading failures are reduced to a static safe error instead of exposing raw filesystem, credential, or network details.

## Compatibility

See [OpenCode compatibility](../compatibility.md#opencode-compatibility) for the canonical host API, test coverage, runtime, operating-system, terminal, and network support requirements.

## Re-running or removing the integration

Running `codex-limits agents install opencode` again is safe. It reports `already installed` when both configuration files already contain the package.

There is no uninstall command. To remove the integration, delete every `@simonesiega/codex-limits` entry from the `plugin` arrays in both OpenCode configuration files, then restart OpenCode. Do not remove unrelated plugins or configuration fields.

## Troubleshooting

### The command does not appear

1. Run `codex-limits agents install opencode` again.
2. Confirm that the reported paths are the OpenCode configuration files used by your installation.
3. Restart OpenCode completely.
4. Check that both files contain a JSON `plugin` array with `@simonesiega/codex-limits`.

### Setup reports invalid JSON

Correct the affected OpenCode configuration before running the installer again. The installer intentionally does not overwrite malformed JSON or replace a non-array `plugin` field.

### Limits cannot be loaded

Run `codex-limits status` outside OpenCode. If data is also unavailable there, verify Codex authentication, local data discovery, and network access.

## Data and privacy

See the [Security policy](../../../SECURITY.md#agent-integrations-and-installers) for the canonical agent, credential, local-data, installer, and output safety guarantees.

## Related documentation

- [Agent integrations](../agent-integrations.md) — Supported-agent index and behavior shared by every adapter.
- [Compatibility](../compatibility.md) — Runtime, operating-system, terminal, network, and agent compatibility.
- [JSON output](../json-output.md) — Machine-readable output, fields, warnings, and scripting behavior.
- [Security policy](../../../SECURITY.md) — Local-data safeguards, network behavior, and vulnerability reporting.
- [OpenCode](https://opencode.ai/) — Official agent website.
- [Troubleshooting](../troubleshooting.md) — Cross-surface diagnosis and common problem resolution.
- [Documentation hub](../../README.md) — Task-oriented index for CLI, automation, agent, development, and security guides.
- [Project README](../../../README.md) — Product overview, installation, commands, and configuration.
