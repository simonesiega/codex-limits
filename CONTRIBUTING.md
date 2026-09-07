# Contributing to Codex Limits

[← Project README](README.md) · [Documentation hub](docs/README.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

Contributions are welcome when they are focused, testable, and aligned with the project's existing architecture and safety boundaries.

Read [`README.md`](README.md) first, follow [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) in every project interaction, then use the [documentation hub](docs/README.md) to find the canonical guide for the area you plan to change.

## Quick start

If you are new to the project, start with [Finding work](#finding-work) to see whether a scoped issue is available.

| Step | Action                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| 1    | Find a scoped issue or discuss substantial work before implementation.                                                      |
| 2    | Fork the repository and create a branch from `main`.                                                                        |
| 3    | Make one focused change with the necessary tests and documentation.                                                         |
| 4    | Run the relevant local checks, then run `bun run check` before submission.                                                  |
| 5    | Open a [Pull Request](https://github.com/simonesiega/codex-limits/compare) with context, rationale, and validation details. |

## Finding work

Maintainers reserve two labels for open issues that are ready for external contributors:

- [`good first issue`](https://github.com/simonesiega/codex-limits/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) identifies bounded tasks with a clear expected outcome and limited project context.
- [`help wanted`](https://github.com/simonesiega/codex-limits/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) identifies accepted work where external implementation or investigation would be useful.

These filters may be empty. In that case, there is no currently advertised contribution task. Follow the [issue process](#issues) only for a genuine bug or focused improvement rather than creating placeholder work.

Comment before substantial implementation to confirm that an issue is available and align on its scope.

## Issues

Before opening a new issue, check existing [Issues](https://github.com/simonesiega/codex-limits/issues) to avoid duplicates. Then use the [issue chooser](https://github.com/simonesiega/codex-limits/issues/new/choose) to open the bug-report or feature-request form.

Security vulnerabilities must use the private process in [`SECURITY.md`](SECURITY.md#reporting-a-vulnerability), not a public issue.

The issue forms ask for the information needed to reproduce and evaluate a report:

| Field               | Why it matters                                           |
| ------------------- | -------------------------------------------------------- |
| Expected behavior   | Explains what should happen.                             |
| Actual behavior     | Shows what currently happens.                            |
| Reproduction steps  | Makes the issue easier to verify.                        |
| Environment         | Helps isolate OS, Node, Bun, or Codex-specific behavior. |
| Logs or screenshots | Clarifies terminal, CLI, or agent output.                |

For architecture-level changes, open an issue first so the design can be discussed before implementation.

## Branch naming

Use a short branch name that describes the scope of the change:

| Type        | Pattern  | Example                     |
| ----------- | -------- | --------------------------- |
| Feature     | `feat/`  | `feat/add-agent-adapter`    |
| Bug fix     | `fix/`   | `fix/usage-window-reset`    |
| Docs        | `docs/`  | `docs/update-agent-guide`   |
| Maintenance | `chore/` | `chore/update-build-config` |
| Tests       | `test/`  | `test/add-coupon-coverage`  |

## Local development

### Requirements

Before starting development, read the project [Requirements](README.md#requirements) and make sure your environment meets them.

Development also requires [Bun](https://bun.sh/) using the version declared in `package.json`. The repository uses Bun for dependency management, scripts, builds, and tests.

Install dependencies:

```bash
bun install
```

Run the CLI locally:

```bash
bun run dev
```

### Validation

Run the complete local validation pipeline:

```bash
bun run check
```

`bun run check` verifies formatting, documentation, types, coverage-enforced tests, production builds, and the packed npm artifact.

Useful focused commands:

| Command                 | Purpose                                                         |
| ----------------------- | --------------------------------------------------------------- |
| `bun run docs:check`    | Run all documentation checks.                                   |
| `bun run docs:link`     | Validate local documentation links, files, and heading anchors. |
| `bun run docs:schema`   | Validate documented JSON examples against their schemas.        |
| `bun run typecheck`     | Type-check the TypeScript project.                              |
| `bun run audit`         | Audit the locked dependency graph.                              |
| `bun test`              | Run the test suite.                                             |
| `bun run test:coverage` | Run tests with source coverage and enforced regression floors.  |
| `bun run build`         | Build the production package.                                   |
| `bun run format`        | Format the repository.                                          |
| `bun run format:check`  | Check formatting without modifying files.                       |

Coverage excludes test files and test-support code under `tests`. Bun enforces per-file regression floors of **84% line coverage** and **33% function coverage** for loaded source files. `bun run check` uses the same coverage command and fails when a loaded source file drops below either floor.

CI uploads the generated LCOV report to Codecov using GitHub OIDC without a long-lived Codecov token. Treat coverage as a regression signal rather than a target: tests should protect observable behavior, safety boundaries, or supported integration contracts rather than execute lines only to increase a percentage.

Shell-completion tests pass generated scripts to any locally installed Bash, Zsh, Fish, PowerShell, and Nushell parsers. CI installs all five and requires each renderer to parse successfully. See [Shell completions](docs/guides/shell-completions.md#how-generation-works) and the [tested shell environments](docs/guides/compatibility.md#tested-shell-completion-generation).

### Real-agent compatibility checks

The `Check` workflow also runs `bun run agents:compat` against packed artifacts in real OpenCode, pi, and GitHub Copilot CLI installations. These host probes run outside the normal local `bun run check` gate because they download and launch external host releases.

The compatibility entry point, [`scripts/check-agent-compatibility.ts`](scripts/check-agent-compatibility.ts), owns isolated package setup plus the shared install and uninstall lifecycle. Focused modules under [`scripts/agent-compatibility`](scripts/agent-compatibility) own host-specific behavior:

- each `*-host.ts` file owns one host probe;
- `interactive-host.ts` owns shared pseudo-terminal dispatch;
- `harness.ts` owns bounded subprocess lifecycle and diagnostics.

Keep host-specific behavior in the matching probe instead of adding it to the entry point.

For a deliberate local run, set `AGENT` to `opencode`, `pi`, or `copilot`, then provide an isolated host installation and packed Codex Limits artifact:

```bash
bun run agents:compat \
  --agent "$AGENT" \
  --host-root "$HOST_ROOT" \
  --package-tarball "$PACKAGE_TARBALL"
```

The host root must contain the selected npm host installation under `node_modules`, and the tarball must contain a built Codex Limits package.

OpenCode and Copilot probes require the Linux `script` pseudo-terminal utility. The Copilot probe also requires `tmux`. The pi probe uses the host's RPC mode and does not require those terminal tools.

See [Compatibility](docs/guides/compatibility.md#tested-environments) for the current tested host matrix.

## Code guidelines

Keep changes small, readable, and easy to review.

| Area               | Guideline                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Core logic         | Keep usage detection, normalization, and safety rules inside `src/package/core`.                  |
| CLI commands       | Add commands through the shared registry and parser; keep handlers focused and capability-scoped. |
| Terminal UI        | Keep Ink rendering inside `src/package/tui`; components should receive display-ready data.        |
| Agent integrations | Keep adapters thin and reuse the shared core instead of reimplementing Codex limit parsing.       |
| Tests              | Add or update tests when behavior, safety rules, or output formatting changes.                    |

When adding a CLI command, create a focused command module and register it in `src/package/commands/command-registry.ts`.

Put names, descriptions, usage, options, positional arguments, conflicts, and safety classification in the command definition so the shared parser, help generator, and shell-completion model stay synchronized. Command factories should accept only the runtime capabilities their handlers use.

## Safety rules

[`SECURITY.md`](SECURITY.md#local-data-and-network-behavior) is the canonical reference for local-data, network, redaction, installer, diagnostic, and reset-mutation safeguards.

Contributors must preserve those boundaries and use only synthetic or redacted values in output, tests, documentation, and screenshots.

Command handlers should let the router replace unexpected exceptions with their fixed command failure message. Use `AgentInstallError` or `AgentUninstallError` only for bounded, deliberately user-safe adapter messages; never pass through a raw filesystem, network, or credential error.

## Adding a new agent

New agents should use the same small adapter shape as [`src/agents/opencode`](https://github.com/simonesiega/codex-limits/tree/main/src/agents/opencode), [`src/agents/pi`](https://github.com/simonesiega/codex-limits/tree/main/src/agents/pi), and [`src/agents/copilot`](https://github.com/simonesiega/codex-limits/tree/main/src/agents/copilot): `install.ts`, `integration.ts`, and `plugin.ts`.

Reuse presentation and safe configuration behavior from `src/agents/shared`; add an agent-specific formatter only when its host requires different output.

| Step | Action                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Create `src/agents/<agent-name>` with the standard three-file adapter layout.                                                          |
| 2    | Define metadata, optional environment help, `install`, `uninstall`, and `inspect` in `integration.ts`.                                 |
| 3    | Keep `plugin.ts` focused on the target host API and load Codex data only through the shared package core.                              |
| 4    | Register the integration descriptor once in `src/agents/index.ts`; shared lifecycle and doctor commands consume it automatically.      |
| 5    | Add install, conservative uninstall, presentation, and host-behavior tests. Document manual validation when automation is impractical. |
| 6    | Add `docs/guides/agents/<agent-name>.md`.                                                                                              |
| 7    | Add the integration to [Agent integrations](docs/guides/agent-integrations.md).                                                        |
| 8    | Add `src/package/<agent-name>.ts`, its host-only `./<agent-name>` subpath, and the shared package-build metadata.                      |
| 9    | Add or update screenshots when visual output changes.                                                                                  |
| 10   | Run `bun run docs:check` and the relevant test/build checks.                                                                           |

When real-host automation is practical, add a focused `scripts/agent-compatibility/*-host.ts` probe and matching workflow matrix entry. Otherwise, document the manual host validation performed.

The goal of every integration is the same: show Codex limit information quickly and safely without sending the request or limits data to the LLM.

## Documentation changes

Task-oriented guides live under [`docs/`](docs/README.md), and visual assets live under [`docs/assets/`](docs/assets/).

Update the canonical guide whenever behavior, setup, compatibility, output, or safety guarantees change. Avoid copying complete procedures into multiple files.

Keep documentation changes consistent with these rules:

- use relative links for files in this repository;
- keep commands executable from their documented working directory;
- keep heading anchors stable when another file links to them;
- keep deep safety behavior in [`SECURITY.md`](SECURITY.md), support requirements in [Compatibility](docs/guides/compatibility.md), cross-surface diagnosis in [Troubleshooting](docs/guides/troubleshooting.md), and agent-specific setup, removal, and troubleshooting in the matching guide under [`docs/guides/agents`](docs/guides/agents);
- summarize and link to the canonical guide instead of copying its detailed procedures or guarantees;
- synchronize every external and inline JSON example with its corresponding schema under `docs/schema`; `bun run docs:schema` enforces the linked examples in `docs/guides/json-output.md`;
- use descriptive image alt text and sanitized screenshots;
- never include tokens, account IDs, cookies, authorization headers, private paths, environment contents, or raw Codex files.

Run:

```bash
bun run docs:check
git diff --check
```

Documentation-only changes do not require unrelated runtime changes, but the complete `bun run check` remains the final repository gate before release.

## Pull requests

Opening a Pull Request loads the repository's [Pull Request template](https://github.com/simonesiega/codex-limits/blob/main/.github/pull_request_template.md). It is the canonical submission checklist for scope, validation, tests, documentation, changelog entries, compatibility, privacy, and screenshots.

Complete every applicable item before requesting review.

## Community guidelines

Every project interaction is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Be clear, respectful, and constructive in issues, Pull Requests, and reviews.

Report conduct concerns through its private reporting process rather than opening a public issue.

Good contributions are focused, tested, documented, and easy to understand.

## Contact

For contribution questions that do not fit an existing issue:

- Email: [simonesiega1@gmail.com](mailto:simonesiega1@gmail.com)
- GitHub: [@simonesiega](https://github.com/simonesiega)

## Related documentation

- [Project README](README.md) — Product overview, installation, commands, and configuration.
- [Documentation hub](docs/README.md) — Task-oriented project documentation.
- [Compatibility](docs/guides/compatibility.md) — Runtime, operating-system, terminal, network, and agent-host requirements.
- [Security policy](SECURITY.md) — Canonical safety behavior and private vulnerability reporting.
- [Code of Conduct](CODE_OF_CONDUCT.md) — Community behavior and conduct reporting.
- [Changelog](CHANGELOG.md) — Released behavior and current unreleased changes.

Thanks for contributing to **`codex-limits`**.
