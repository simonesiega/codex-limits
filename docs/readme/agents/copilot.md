# GitHub Copilot CLI integration

[← Documentation hub](../../README.md) · [Agent integrations](../agent-integrations.md) · [Project README](../../../README.md)

The GitHub Copilot CLI integration adds a read-only `/codex-limits` extension command that loads the shared core locally and displays Codex usage windows, reset times, reset credits, and safe warnings without sending the request or limit data to the LLM.

## Overview

| Detail             | Value                                   |
| ------------------ | --------------------------------------- |
| Agent              | [GitHub Copilot CLI][copilot-cli]       |
| Status             | Supported                               |
| Agent command      | `/codex-limits`                         |
| Install command    | `codex-limits agents install copilot`   |
| Uninstall command  | `codex-limits agents uninstall copilot` |
| Installation scope | Global for the current user             |
| Host API           | Experimental Copilot CLI extensions     |

## Installation

Install GitHub Copilot CLI and `codex-limits`, then run the named installer:

```bash
npm install -g @github/copilot@latest
npm install -g @simonesiega/codex-limits@latest
codex-limits agents install copilot
```

Other official Copilot CLI installation methods are documented in [Installing GitHub Copilot CLI][copilot-install]. The explicit agent name works in interactive and non-interactive terminals. The compatible `codex-limits init --copilot` form is also supported.

Restart GitHub Copilot CLI after installation so it discovers the extension. Use Copilot CLI's `/extensions` command to review or re-enable extensions when extension loading is disabled in the host.

### Extension file

The installer writes one user-scoped extension entry point:

```text
~/.copilot/extensions/codex-limits/extension.mjs
```

When `COPILOT_HOME` is set, the installer uses `extensions/codex-limits/extension.mjs` under that directory instead. The `codex-limits` subdirectory gives the extension its host-visible name.

The published package contains the bundled source at `dist/copilot.mjs` and exposes that host module as `@simonesiega/codex-limits/copilot`. The installer copies the same bundle to the ESM `extension.mjs` entry point. GitHub Copilot CLI starts it as a separate Node.js process and supplies `@github/copilot-sdk/extension` through its extension module resolver; users do not install the SDK separately. The package subpath is a host entry point, not an alternative installation command or a general-purpose JavaScript API.

The installer creates the dedicated extension directory, updates older bundles managed by `codex-limits`, leaves unrelated files unchanged, and reports `already installed` when the current bundle is present. It refuses to replace an unrecognized or competing extension entry point.

Installer identity checks, file-handling, size, symbolic-link, atomic-write, and path-redaction guarantees are canonical in the [Security policy](../../../SECURITY.md#agent-integrations-and-installers).

## Using `/codex-limits`

Start a new interactive Copilot CLI session, then invoke:

```text
/codex-limits
```

> [!IMPORTANT]
> Run the command only inside Copilot CLI's interactive interface. Do not use `copilot -p "/codex-limits"`; prompt mode can treat that text as an LLM prompt instead of dispatching the extension command.

The extension logs a compact limits summary directly to the Copilot CLI timeline, including:

- remaining capacity and status for the weekly window;
- the 5-hour window when supplied by Codex;
- compact progress bars and reset durations;
- available reset credits and the next expiration;
- safe warnings when some data is unavailable.

The slash-command handler calls the shared local core directly. It does not call `session.send()`, create a user message, or ask the model to process the request. Loading and timeline failures are reduced to static safe messages instead of exposing raw filesystem, credential, or network details.

## Compatibility

See [GitHub Copilot CLI compatibility](../compatibility.md#github-copilot-cli-compatibility) for the canonical experimental host, Node.js, SDK, test coverage, operating-system, terminal, and network support requirements. Keep Copilot CLI current and consult the SDK's [extension documentation][copilot-extension-docs] for its evolving host contract.

## Re-running or removing the integration

Running `codex-limits agents install copilot` again is safe. It reports `already installed` when the installed entry point matches the current package and replaces only a previously managed older bundle.

Remove the managed extension with:

```bash
codex-limits agents uninstall copilot
```

The uninstaller uses the same `COPILOT_HOME` resolution as installation. It removes only `extensions/codex-limits/extension.mjs` when the bounded file contains the Codex Limits management marker. It removes the dedicated directory only when empty and preserves unrelated sibling files. A missing entry with no competing entry point reports `not installed`; an unrecognized, competing, oversized, unreadable, or symbolic-link entry fails closed and is not deleted. Restart Copilot CLI after successful removal.

## Troubleshooting

### The command does not appear

1. Run `codex-limits agents install copilot` again.
2. Confirm that it reports `extension.mjs` as installed or already installed.
3. Restart GitHub Copilot CLI completely.
4. Run `/extensions` and confirm that `codex-limits` is discovered and enabled.
5. Check that a project-local `.github/extensions/codex-limits/extension.mjs` is not shadowing the user extension with the same name.
6. Update Copilot CLI if the installed release does not support experimental extensions and session commands.

### The extension path is already in use

The installer found an `extension.mjs` that is not marked as a bundle managed by `codex-limits`, or it found a competing `extension.cjs` or `extension.js`, so it left the directory unchanged. Review the dedicated `codex-limits` extension directory manually. Move or remove only the conflicting entry point if you are certain it is unrelated, then run the installer again.

### The integration bundle is unavailable

Reinstall or rebuild `@simonesiega/codex-limits`, then run the installer again. Published packages include `dist/copilot.mjs`; source checkouts create it with `bun run build`.

### Limits cannot be loaded

Run `codex-limits doctor` and `codex-limits status` outside Copilot CLI. If data is also unavailable there, verify Codex authentication, local data discovery, and network access.

## Data and privacy

See the [Security policy](../../../SECURITY.md#agent-integrations-and-installers) for the canonical agent, credential, local-data, installer, and output safety guarantees. Copilot CLI extensions execute as separate processes with the current user's system permissions, so install only extensions you trust.

## Related documentation

- [Agent integrations](../agent-integrations.md) — Supported-agent index and behavior shared by every adapter.
- [Compatibility](../compatibility.md) — Runtime, operating-system, terminal, network, and agent compatibility.
- [JSON output](../json-output.md) — Machine-readable output, fields, warnings, and scripting behavior.
- [Security policy](../../../SECURITY.md) — Local-data safeguards, network behavior, and vulnerability reporting.
- [GitHub Copilot CLI][copilot-cli] — Official CLI repository.
- [Copilot CLI documentation][copilot-docs] — Official concepts and usage documentation.
- [Copilot SDK extension documentation][copilot-extension-docs] — Current experimental extension lifecycle and API.
- [Troubleshooting](../troubleshooting.md) — Cross-surface diagnosis and common problem resolution.
- [Documentation hub](../../README.md) — Task-oriented index for CLI, automation, agent, development, and security guides.
- [Project README](../../../README.md) — Product overview, installation, commands, and configuration.

[copilot-cli]: https://github.com/github/copilot-cli
[copilot-docs]: https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli
[copilot-install]: https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli
[copilot-extension-docs]: https://github.com/github/copilot-sdk/blob/main/nodejs/docs/extensions.md
