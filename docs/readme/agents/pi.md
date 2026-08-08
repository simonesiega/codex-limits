# pi integration

[← Documentation hub](../../README.md) · [Agent integrations](../agent-integrations.md) · [Project README](../../../README.md)

The pi integration adds a read-only `/codex-limits` extension command that loads the shared core locally and displays Codex usage windows, reset times, reset credits, and safe warnings without sending the request or limit data to the LLM.

## Overview

| Detail             | Value                              |
| ------------------ | ---------------------------------- |
| Agent              | [pi](https://pi.dev/)              |
| Status             | Supported                          |
| Agent command      | `/codex-limits`                    |
| Install command    | `codex-limits agents install pi`   |
| Uninstall command  | `codex-limits agents uninstall pi` |
| Installation scope | Global for the current user        |

## Installation

Install the CLI and pi, then run the named installer:

```bash
npm install -g @simonesiega/codex-limits@latest
npm install -g @earendil-works/pi-coding-agent@latest
codex-limits agents install pi
```

The explicit agent name works in interactive and non-interactive terminals. The compatible `codex-limits init --pi` form is also supported. Restart pi after installation so it reloads its extensions. An already-running pi session can use `/reload` instead.

### Configuration

The installer updates pi's global settings file:

```text
~/.pi/agent/settings.json
```

When `PI_CODING_AGENT_DIR` is set, the installer uses `settings.json` under that directory instead. It adds the current Codex Limits package root to the `packages` array. The published package declares this pi manifest:

```json
{
  "pi": {
    "extensions": ["./dist/pi.js"]
  }
}
```

Registering the local package root avoids another download and keeps the extension synchronized with the globally installed `codex-limits` package. The same host module is exposed explicitly as `@simonesiega/codex-limits/pi`, but pi installation continues to use the package manifest rather than that subpath directly. The installer also recognizes existing unversioned, tagged, or pinned `npm:@simonesiega/codex-limits` pi package registrations. If a matching object registration filters out the bundled extension, the named installer force-enables only `dist/pi.js` while preserving unrelated resource filters.

The installer creates missing settings objects, preserves unrelated settings and package registrations, avoids duplicates, and verifies that the package manifest and `dist/pi.js` bundle are available.

Installer file-handling, size, symbolic-link, atomic-write, package-filter, and path-redaction guarantees are canonical in the [Security policy](../../../SECURITY.md#agent-integrations-and-installers).

Pi's native package command is also supported because the npm package includes the pi manifest:

```bash
pi install npm:@simonesiega/codex-limits
```

Use either installation method rather than registering the package twice.

## Using `/codex-limits`

Restart pi or run `/reload`, then invoke:

```text
/codex-limits
```

The extension loads the shared core directly and opens a themed overlay containing:

- remaining capacity and status for the weekly window;
- the 5-hour window when supplied by Codex;
- compact progress bars and reset durations;
- available reset credits and the next expiration;
- safe warnings when some data is unavailable.

Press Enter, Escape, or Ctrl+C to close the overlay. While data loads, the extension shows a temporary footer status. Loading and display failures are reduced to static safe messages instead of exposing raw filesystem, credential, or network details.

The command is interactive-TUI-only. In pi RPC, print, and JSON modes, it performs no lookup and sends no message to the model.

## Compatibility

See [pi compatibility](../compatibility.md#pi-compatibility) for the canonical host version, Node.js, peer dependency, test coverage, operating-system, terminal, and network support requirements.

## Re-running or removing the integration

Running `codex-limits agents install pi` again is safe. It reports `already installed` when the matching local or npm package registration is already enabled.

Remove recognized registrations with:

```bash
codex-limits agents uninstall pi
```

The uninstaller removes only package entries that exactly identify the current local Codex Limits package root or an unversioned, tagged, or pinned `npm:@simonesiega/codex-limits` source. It handles those recognized registrations regardless of whether they were added by `codex-limits` or pi's native package manager, and preserves unrelated packages and settings. It does not invoke pi's package manager or remove any separate package-manager cache. Use `pi remove npm:@simonesiega/codex-limits` instead when you want pi to manage its complete native package lifecycle.

An absent registration reports `not installed`. Malformed, oversized, or symbolic-link settings fail without being rewritten. Restart pi or run `/reload` after successful removal.

## Troubleshooting

### The command does not appear

1. Run `codex-limits agents install pi` again.
2. Confirm that it reports the pi settings file as installed or already installed.
3. Restart pi or run `/reload`.
4. Check that the global `packages` array contains the Codex Limits local package path or `npm:@simonesiega/codex-limits`.

### Setup reports invalid JSON

Correct the affected pi settings before running the installer again. The installer intentionally does not overwrite malformed JSON or replace an invalid `packages` field.

### The integration bundle is unavailable

Reinstall or rebuild `@simonesiega/codex-limits`, then run the installer again. Published packages include `dist/pi.js`; source checkouts create it with `bun run build`.

### Limits cannot be loaded

Run `codex-limits doctor` and `codex-limits status` outside pi. If data is also unavailable there, verify Codex authentication, local data discovery, and network access.

## Data and privacy

See the [Security policy](../../../SECURITY.md#agent-integrations-and-installers) for the canonical agent, credential, local-data, installer, and output safety guarantees. Pi extensions execute with the current user's system permissions, so install only packages you trust.

## Related documentation

- [Agent integrations](../agent-integrations.md) — Supported-agent index and behavior shared by every adapter.
- [Compatibility](../compatibility.md) — Runtime, operating-system, terminal, network, and agent compatibility.
- [JSON output](../json-output.md) — Machine-readable output, fields, warnings, and scripting behavior.
- [Security policy](../../../SECURITY.md) — Local-data safeguards, network behavior, and vulnerability reporting.
- [pi](https://pi.dev/) — Official agent website.
- [Troubleshooting](../troubleshooting.md) — Cross-surface diagnosis and common problem resolution.
- [Documentation hub](../../README.md) — Task-oriented index for CLI, automation, agent, development, and security guides.
- [Project README](../../../README.md) — Product overview, installation, commands, and configuration.
