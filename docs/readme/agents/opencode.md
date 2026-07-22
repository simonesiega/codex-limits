# OpenCode integration

The OpenCode integration adds a read-only `/codex-limits` command that loads the shared core locally and displays Codex usage windows, reset times, reset credits, and safe warnings without sending a prompt to an LLM.

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

Both files are updated because compatible OpenCode versions discover TUI plugins through different global configuration files. The installer:

- creates a missing configuration as a JSON object with the appropriate OpenCode schema;
- preserves existing configuration fields and plugin entries;
- recognizes unversioned, tagged, pinned, and tuple forms of the package and does not add duplicates;
- writes changed files through a sibling temporary file to avoid partial JSON;
- refuses symbolic-link configuration files instead of following or replacing the link;
- refuses to modify malformed, non-object, oversized, or invalid `plugin` configurations.

Configuration files larger than 1 MB are not modified. If one file is already configured and the other is not, only the missing plugin registration is added. Installation results shorten paths under the user home to `~/...`; unexpected paths outside the home are displayed as `[path]`.

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

The adapter supports OpenCode hosts that expose either:

- the current keymap layer registration API; or
- the legacy command registration API.

Compatibility is determined from the API shape available at runtime rather than from a list of exact OpenCode versions. Automated adapter tests use host mocks for both supported API shapes; the repository does not currently claim end-to-end validation against named OpenCode releases.

See the general [Compatibility guide](../compatibility.md) for tested runtimes, operating systems, terminals, and network behavior.

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

The integration follows the safety guarantees defined for [all agent integrations](../agent-integrations.md#data-and-privacy). It does not send a prompt or Codex limit data to an LLM, and displayed output excludes sensitive credentials and raw local data.

## Related documentation

- [Agent integrations](../agent-integrations.md) — Supported-agent index and behavior shared by every adapter.
- [Compatibility](../compatibility.md) — Runtime, operating-system, terminal, network, and agent compatibility.
- [JSON output](../json-output.md) — Machine-readable output, fields, warnings, and scripting behavior.
- [Security policy](../../../SECURITY.md) — Local-data safeguards, network behavior, and vulnerability reporting.
- [OpenCode](https://opencode.ai/) — Official agent website.
- [Project README](../../../README.md#documentation) — Installation, commands, configuration, and the complete documentation index.
