<p align="center">
  <img src="docs/assets/logo/logo.png" alt="codex-limits logo" width="180" />
</p>

<h1 align="center">
  Contributing to Codex Limits
</h1>

<p align="center">
    Guidelines for contributing to <strong>codex-limits</strong>.
</p>

Read [`README.md`](README.md) first, follow the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) in every project interaction, then use the [documentation hub](docs/README.md) to find the canonical guide for the area you plan to change.

## Contents

- [Quick start](#quick-start)
- [Branch naming](#branch-naming)
- [Finding work](#finding-work)
- [Issues](#issues)
- [Local development](#local-development)
- [Code guidelines](#code-guidelines)
- [Safety rules](#safety-rules)
- [Adding a new agent](#adding-a-new-agent)
- [Documentation changes](#documentation-changes)
- [Pull requests](#pull-requests)
- [Community guidelines](#community-guidelines)
- [Contact](#contact)

## Quick start

If you are new to the project, start with [Finding work](#finding-work) to see whether a scoped issue is available.

| Step | Action                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 1    | Fork the repository.                                                                                   |
| 2    | Create a branch from `main`.                                                                           |
| 3    | Make one focused change.                                                                               |
| 4    | Run the local checks.                                                                                  |
| 5    | Open a [Pull Request](https://github.com/simonesiega/codex-limits/compare) with context and rationale. |

## Branch naming

| Type        | Pattern  | Example                     |
| ----------- | -------- | --------------------------- |
| Feature     | `feat/`  | `feat/add-agent-adapter`    |
| Bug fix     | `fix/`   | `fix/usage-window-reset`    |
| Docs        | `docs/`  | `docs/update-agent-guide`   |
| Maintenance | `chore/` | `chore/update-build-config` |
| Tests       | `test/`  | `test/add-coupon-coverage`  |

## Finding work

Maintainers reserve two labels for open issues that are ready for external contributors:

- [`good first issue`](https://github.com/simonesiega/codex-limits/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) identifies bounded tasks with a clear expected outcome and limited project context.
- [`help wanted`](https://github.com/simonesiega/codex-limits/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) identifies accepted work where external implementation or investigation would be useful.

These filters may be empty. In that case, there is no currently advertised contribution task. Follow the [issue process](#issues) only for a genuine bug or focused improvement rather than creating placeholder work. Comment before substantial implementation to confirm that an issue is available and align on its scope.

## Issues

Before opening a new issue, check existing [Issues](https://github.com/simonesiega/codex-limits/issues) to avoid duplicates. Then use the [issue chooser](https://github.com/simonesiega/codex-limits/issues/new/choose) to open the bug-report or feature-request form. Security vulnerabilities must use the private process in [`SECURITY.md`](SECURITY.md#reporting-a-vulnerability), not a public issue.

The issue forms prompt for:

| Field               | Why it matters                                           |
| ------------------- | -------------------------------------------------------- |
| Expected behavior   | Explains what should happen.                             |
| Actual behavior     | Shows what currently happens.                            |
| Reproduction steps  | Makes the issue easier to verify.                        |
| Environment         | Helps isolate OS, Node, Bun, or Codex-specific behavior. |
| Logs or screenshots | Clarifies terminal, CLI, or agent output.                |

For architecture-level changes, open an issue first so the design can be discussed before implementation.

## Local development

### Requirements

Before starting development, read the project [Requirements](README.md#requirements) and make sure your environment meets them. Development also requires [Bun](https://bun.sh/) using the version declared in `package.json`, because this repository uses Bun for dependency management, scripts, builds, and tests.

Install dependencies:

```bash
bun install
```

Run the CLI locally:

```bash
bun run dev
```

Run the full validation pipeline (format verification, documentation checks, types, coverage-enforced tests, production builds, and packed-artifact smoke checks):

```bash
bun run check
```

Run all documentation checks:

```bash
bun run docs:check
```

Run the documentation checks individually:

```bash
bun run docs:link
bun run docs:schema
```

Audit the locked dependency graph:

```bash
bun run audit
```

Run tests only:

```bash
bun test
```

Run tests with source coverage reporting and the enforced regression floors:

```bash
bun run test:coverage
```

Coverage excludes test files and test support code under `tests`. The reviewed Bun 1.3.14 baseline measures 97.84% aggregate line coverage and 97.98% aggregate function coverage; the minimum loaded-source-file results are 84.48% for lines and 33.33% for functions. Because Bun applies configured thresholds per file, the validation floors round those per-file baselines down to 84% for lines and 33% for functions. `bun run check` uses the same coverage command and fails when a loaded source file drops below either floor.

CI uploads the generated LCOV report to Codecov using GitHub OIDC, without a long-lived Codecov token. The README badge reflects the latest uploaded `main`-branch report; Bun's local thresholds remain the coverage regression gate.

Treat coverage as a regression signal rather than a target. Tests should protect observable behavior, safety boundaries, or supported integration contracts; do not add assertions solely to execute uncovered lines.

Shell-completion tests pass generated scripts to any locally installed Bash, Zsh, Fish, PowerShell, and Nushell parsers. CI installs all five and sets `CODEX_LIMITS_REQUIRE_COMPLETION_SHELLS=true`, so every supported renderer is required there. See [Shell completions](docs/guides/shell-completions.md#how-it-works) and the [tested shell environments](docs/guides/compatibility.md#tested-shell-completion-generation).

Build the package:

```bash
bun run build
```

Format the repository or check formatting without changing files:

```bash
bun run format
bun run format:check
```

The `Check` workflow also runs `bun run agents:compat` against packed artifacts in real OpenCode, pi, and GitHub Copilot CLI installations. These external-host probes run outside the normal local `bun run check` gate because they download and launch host releases. The workflow executes the complete matrix in isolated Linux jobs; see [Compatibility](docs/guides/compatibility.md#tested-environments) for the current versions.

The compatibility entry point, [`scripts/check-agent-compatibility.ts`](scripts/check-agent-compatibility.ts), owns isolated package setup plus the shared install and uninstall lifecycle. It delegates host behavior to focused modules under [`scripts/agent-compatibility`](scripts/agent-compatibility): each `*-host.ts` file owns one host probe, `interactive-host.ts` owns shared pseudo-terminal dispatch, and `harness.ts` owns bounded subprocess lifecycle and diagnostics. Keep host-specific behavior in the matching probe instead of adding it to the entry point.

The workflow supplies all required command options. For a deliberate local run, set `AGENT` to `opencode`, `pi`, or `copilot`, then set `HOST_ROOT` and `PACKAGE_TARBALL` to the isolated host installation and packed artifact:

```bash
bun run agents:compat \
  --agent "$AGENT" \
  --host-root "$HOST_ROOT" \
  --package-tarball "$PACKAGE_TARBALL"
```

The host root must contain the selected npm host installation under `node_modules`, and the tarball must contain a built Codex Limits package. OpenCode and Copilot probes require the Linux `script` pseudo-terminal utility; the Copilot probe also requires `tmux`. The pi probe uses the host's RPC mode and does not require those terminal tools.

## Code guidelines

Keep changes small, readable, and easy to review.

| Area               | Guideline                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Core logic         | Keep usage detection, normalization, and safety rules inside `src/package/core`.                  |
| CLI commands       | Add commands through the shared registry and parser; keep handlers focused and capability-scoped. |
| Terminal UI        | Keep Ink rendering inside `src/package/tui`; components should receive display-ready data.        |
| Agent integrations | Keep adapters thin and reuse the shared core instead of reimplementing Codex limit parsing.       |
| Tests              | Add or update tests when behavior, safety rules, or output formatting changes.                    |

When adding a CLI command, create a focused command module and register it in `src/package/commands/command-registry.ts`. Put names, descriptions, usage, options, positional arguments, conflicts, and safety classification in that command definition so the shared parser and help generator stay synchronized. Command factories should accept only the runtime capabilities their handlers use.

## Safety rules

[`SECURITY.md`](SECURITY.md#local-data-and-network-behavior) is the canonical reference for local-data, network, redaction, installer, diagnostic, and reset-mutation safeguards. Contributors must preserve those boundaries and use only synthetic or redacted values in output, tests, documentation, and screenshots.

Command handlers should let the router replace unexpected exceptions with their fixed command failure message. Use `AgentInstallError` or `AgentUninstallError` only for bounded, deliberately user-safe adapter messages; never pass through a raw filesystem, network, or credential error.

## Adding a new agent

New agents should use the same small adapter shape as [`src/agents/opencode`](https://github.com/simonesiega/codex-limits/tree/main/src/agents/opencode), [`src/agents/pi`](https://github.com/simonesiega/codex-limits/tree/main/src/agents/pi), and [`src/agents/copilot`](https://github.com/simonesiega/codex-limits/tree/main/src/agents/copilot): `install.ts`, `integration.ts`, and `plugin.ts`. Reuse presentation and safe configuration behavior from `src/agents/shared`; add an agent-specific formatter only when its host requires different output.

| Step | Action                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Create `src/agents/<agent-name>` with the standard three-file adapter layout.                                                          |
| 2    | Define metadata, optional environment help, `install`, `uninstall`, and `inspect` in `integration.ts`.                                 |
| 3    | Keep `plugin.ts` focused on the target host API and load Codex data only through the shared package core.                              |
| 4    | Register the integration descriptor once in `src/agents/index.ts`; shared lifecycle and doctor commands consume it automatically.      |
| 5    | Add install, conservative uninstall, presentation, and host-behavior tests. Document manual validation when automation is impractical. |
| 6    | Add `docs/guides/agents/<agent-name>.md`.                                                                                              |
| 7    | Add the integration to [Agent Integrations](docs/guides/agent-integrations.md).                                                        |
| 8    | Add `src/package/<agent-name>.ts`, its host-only `./<agent-name>` subpath, and the shared package-build metadata.                      |
| 9    | Add or update screenshots when the visual output changes.                                                                              |
| 10   | Run the documentation link and schema checks.                                                                                          |

When real-host automation is practical, add a focused `scripts/agent-compatibility/*-host.ts` probe and matching workflow matrix entry. Otherwise, document the manual host validation performed.

The goal of every integration is the same: show Codex limit information quickly and safely without sending the request or limit data to the LLM.

## Documentation changes

Task-oriented guides live under [`docs/`](docs/README.md), and visual assets live under [`docs/assets/`](docs/assets/). Update the canonical guide whenever behavior, setup, compatibility, output, or safety guarantees change; avoid copying complete procedures into multiple files.

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

Opening a Pull Request loads the repository's [Pull Request template](https://github.com/simonesiega/codex-limits/blob/main/.github/pull_request_template.md). It is the canonical submission checklist for scope, validation, tests, documentation, changelog entries, compatibility, privacy, and screenshots. Complete every applicable item before requesting review.

## Community guidelines

Every project interaction is governed by the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Be clear, respectful, and constructive in issues, Pull Requests, and reviews. Report conduct concerns through its private reporting process rather than opening a public issue.

Good contributions are focused, tested, documented, and easy to understand.

## Contact

For direct contact:

- Email: [simonesiega1@gmail.com](mailto:simonesiega1@gmail.com)
- GitHub: [@simonesiega](https://github.com/simonesiega)

Thanks for contributing to **`codex-limits`**.
