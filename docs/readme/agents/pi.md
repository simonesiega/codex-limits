# pi integration

[← Documentation hub](../../README.md) · [Agent integrations](../agent-integrations.md) · [Project README](../../../README.md)

The pi integration adds a read-only `/codex-limits` extension command that loads the shared core locally and displays Codex usage windows, reset times, reset credits, and safe warnings without sending a prompt to an LLM.

## Overview

| Detail             | Value                            |
| ------------------ | -------------------------------- |
| Agent              | [pi](https://pi.dev/)            |
| Status             | Supported                        |
| Agent command      | `/codex-limits`                  |
| Install command    | `codex-limits agents install pi` |
| Installation scope | Global for the current user      |

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

Registering the local package root avoids another download and keeps the extension synchronized with the globally installed `codex-limits` package. The installer also recognizes existing unversioned, tagged, or pinned `npm:@simonesiega/codex-limits` pi package registrations. If a matching object registration filters out the bundled extension, the named installer force-enables only `dist/pi.js` while preserving unrelated resource filters.

The installer:

- creates a missing settings file as a JSON object;
- preserves unrelated settings and package registrations;
- avoids duplicate local and npm package registrations;
- verifies that the package manifest declares the bundled `dist/pi.js` extension and that the bundle is available;
- writes changes through an owner-only sibling temporary file to avoid partial JSON;
- refuses symbolic-link, malformed, non-object, oversized, or invalid `packages` settings.

Settings files larger than 1 MB are not modified. Installation output shortens paths under the user home to `~/...` and displays unexpected paths outside it as `[path]`.

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

The adapter uses pi's extension APIs for command registration, footer status, notifications, and custom overlays. It is developed against `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` 0.81.x. Those host packages are optional peers and are not bundled into `codex-limits`.

Pi 0.81.x requires Node.js 22.19 or newer. This requirement applies to the pi host; the standalone `codex-limits` CLI continues to support Node.js 20 or newer. Automated tests use extension-host mocks and the real pi TUI component classes. Local validation also confirmed package discovery and command interception with pi 0.81.1 in print mode, without invoking the model; the interactive overlay is not terminal-tested against every pi release.

See the general [Compatibility guide](../compatibility.md) for tested runtimes, operating systems, terminals, and network behavior.

## Re-running or removing the integration

Running `codex-limits agents install pi` again is safe. It reports `already installed` when the matching local or npm package registration is already enabled.

There is no `codex-limits` uninstall command. To remove an integration installed by the named installer, delete only the Codex Limits package entry from the global pi `packages` array, then restart pi or run `/reload`. If it was installed with pi's native package manager, use:

```bash
pi remove npm:@simonesiega/codex-limits
```

Do not remove unrelated pi packages or settings.

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

The integration follows the safety guarantees defined for [all agent integrations](../agent-integrations.md#data-and-privacy). It does not send a prompt or Codex limit data to an LLM, and displayed output excludes sensitive credentials, private paths, and raw local data.

Pi extensions execute with the current user's system permissions. Install only packages you trust, as described in pi's own extension security guidance.

## Related documentation

- [Agent integrations](../agent-integrations.md) — Supported-agent index and behavior shared by every adapter.
- [Compatibility](../compatibility.md) — Runtime, operating-system, terminal, network, and agent compatibility.
- [JSON output](../json-output.md) — Machine-readable output, fields, warnings, and scripting behavior.
- [Security policy](../../../SECURITY.md) — Local-data safeguards, network behavior, and vulnerability reporting.
- [pi](https://pi.dev/) — Official agent website.
- [Documentation hub](../../README.md) — Task-oriented index for CLI, automation, agent, development, and security guides.
- [Project README](../../../README.md) — Product overview, installation, commands, configuration, and troubleshooting.
