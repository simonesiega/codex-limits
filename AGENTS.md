# agents.md

## Purpose

This project (`codex-limits`) is a TypeScript/Bun CLI for checking Codex usage limits, reset times, and reset-credit coupons from the terminal.

The goal is to provide a **small, safe, read-only dashboard** for Codex users without forcing them to open a browser, inspect local files manually, or break their coding flow.

The CLI can be used directly from the terminal, from plain-text commands, from JSON output, and from supported agent integrations. This repository focuses on:

- Codex usage discovery
- usage window normalization
- safe terminal output
- reset-credit coupon summaries
- scriptable CLI commands
- thin coding-agent integrations

The goal for `codex-limits` is to stay fast, predictable, safe by default, and easy to extend with new agent adapters.

### Core Priorities

1. Safety first.
2. Predictable output first.
3. Keep shared behavior centralized in the core and reused by the CLI, TUI, JSON output, and agents.

If a tradeoff is required, choose correctness, redaction, and stability over convenience or visual polish.

## High-Level Architecture

```text
src/package/core      → Shared domain logic. Owns Codex data discovery, usage parsing, live coupon data, normalization, warnings, and redaction.
src/package/commands  → CLI command layer. Owns command routing for dashboard, status, coupons, JSON, init, help, and version.
src/package/tui       → Ink terminal UI. Owns rendering only and consumes normalized display-ready data.
src/agents            → Agent integration source. Owns supported agent adapters and registration.
agents                → Generated/installable agent files when integrations require them.
tests                 → Behavior, output, safety, and integration tests.
docs/photos           → README screenshots and visual documentation assets.
```

### Runtime Model

```text
Terminal usage:
user terminal → codex-limits CLI → shared core reads/discovers Codex data → command output or Ink TUI

Script usage:
script/automation → codex-limits --json → shared core → stable machine-readable JSON

Agent usage:
coding agent command → agent adapter → shared core → read-only Codex limits view inside the agent
```

- The **core package** is the authority for Codex data discovery, parsing, normalization, optional live data fetching, warnings, and redaction.
- The **commands package** is responsible for CLI behavior and should not reimplement domain parsing.
- The **TUI package** is a rendering layer. It must not read local Codex files, fetch live data directly, or define safety rules.
- The **agents package** is an adapter layer. Each integration should stay thin and reuse the shared core.
- The **tests folder** protects behavior, output stability, safety rules, and integration logic.
- The **docs/photos folder** is only for visual assets used in documentation. Screenshots must never contain private tokens, account IDs, cookies, auth headers, or raw local files.

## Tech Stack

```text
Runtime:
- Bun

Language:
- TypeScript

CLI:
- Node-compatible package entry points
- npm global install

Terminal UI:
- Ink / React-style terminal rendering

Agent integrations:
- OpenCode currently supported
- Additional adapters can be added under src/agents

Testing:
- Bun test runner

Documentation:
- README.md
- CONTRIBUTING.md
- CHANGELOG.md
- AGENTS.md
```

### Rules

- Use **Bun** for package management and scripts (`bun install`, `bun run ...`, `bun test`).
- Do not mix npm/yarn/pnpm for local development unless the task explicitly requires package-publishing verification.
- Prefer **TypeScript everywhere**.
- Keep `src/package/core` as the shared source of truth.
- Keep command behavior in `src/package/commands`.
- Keep Ink rendering in `src/package/tui`.
- Keep agent-specific logic in `src/agents/<agent-name>`.
- Keep tests in `tests` and update them when behavior changes.
- Always run verification commands from the repository root:
  - `bun test`
  - `bun run check`
  - `bun run build`
- Before editing a nested area, check whether that area contains its own `AGENTS.md`. If it exists, read and follow it in addition to this root file.
- Read [`README.md`](README.md), [`CONTRIBUTING.md`](CONTRIBUTING.md), and [`CHANGELOG.md`](CHANGELOG.md) before making broad or release-relevant changes.

## Maintainability

Long-term maintainability is a core priority.

Before adding new logic, check whether the behavior belongs in the shared core. Duplicate parsing or normalization across commands, TUI components, JSON handlers, and agent adapters is a code smell and should be avoided.

Do not take shortcuts by adding local one-off logic to a command or integration when the behavior should be shared. It is acceptable to change existing code when it improves structure, safety, or consistency, but keep the patch focused.

The project should remain small. Avoid large abstractions unless they clearly reduce duplication or protect behavior across multiple output surfaces.

## Code Standards

- Favor readability over micro-optimizations: straightforward control flow, early returns, clear names, and small focused modules.
- Prefer `const` over `let` when values are not reassigned.
- Use `import type` for type-only imports.
- Keep strings double-quoted when editing TypeScript, unless the surrounding file clearly uses another style.
- Use kebab-case for new files and folders unless the existing local convention differs.
- Read files in full before making wide-ranging changes or editing files you have not inspected.
- Do not rely only on search snippets for broad changes.
- Single-line helper functions with a single call site are usually unnecessary; inline them unless they improve clarity.
- Always ask before removing functionality or code that appears intentional.
- Do not preserve backward compatibility unless the user explicitly asks for it or the change affects published CLI behavior.
- Keep public CLI output stable unless the task is specifically about changing it.
- Keep `--json` output machine-readable and predictable.

### Imports and logging

- Prefer existing local import conventions in the file being edited.
- Do not introduce path aliases unless the project already uses them or the user asks for that change.
- Avoid deep relative import chains when a cleaner existing export is available.
- Never include TypeScript file extensions in imports (`.ts` or `.tsx`) unless the project configuration requires it.
- Do not create new `index.ts` barrel files unless the package already uses that pattern and the export is needed.
- Keep logging minimal and purposeful.
- Remove temporary debug output before handing off.
- Never log tokens, account IDs, auth headers, cookies, raw local Codex files, private environment values, or full credential objects.

### Implementation Logic

Keep procedure logic, shared helpers, mappers, resolvers, factories, builders, classes, state holders, and lifecycle coordinators easy to scan and understand. Use these rules by role, not only by folder name.

- Put domain behavior in `src/package/core`.
- Put CLI orchestration in `src/package/commands`.
- Put rendering behavior in `src/package/tui`.
- Put agent-specific glue code in `src/agents/<agent-name>`.
- Order helper functions in a way that makes the file easy to read. Prefer local private helpers near the code that uses them.
- If a function uses a named `Options` type or interface, place that type close to the function that uses it.
- Add small TSDoc comments to exported functions, exported classes, and public methods when their role is not obvious.
- Add comments to non-exported functions only when the behavior is not trivial.
- Do not add comments that restate the code.
- Keep redaction and safety behavior explicit.

## User override

If the user instructions conflict with rules set out here, ask for confirmation that they want to override the rules. Only then execute their instructions.

Do not override safety rules silently. If the user asks to print, expose, commit, or document private Codex data, explain that the project should use placeholders or redacted values instead.

## Changelog

Location: `CHANGELOG.md` at the repository root.

Sections under `## [Unreleased]`: `### Breaking Changes`, `### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Security`.

Rules:

- Add a changelog entry for every user-facing, release-relevant change.
- All new entries go under `## [Unreleased]`. Read the section first and append to existing subsections; never duplicate section headers.
- Do not add entries for purely internal cleanup, refactors, tests, or documentation-only changes unless they affect released behavior, release operations, safety, or maintainability.
- Released version sections are immutable; never modify them.
- If `CHANGELOG.md` does not exist yet and the task is release-relevant, create it using the section structure above.

Style:

- Write changelogs concise, product-facing, and focused on observable behavior.
- Describe what changed for users, not internal implementation details, commit work, or the wording of the request.
- Use plain past-tense release-note phrasing: `Added ...`, `Changed ...`, `Fixed ...`, `Removed ...`.
- Prefer one clear sentence. Add a second sentence only when needed to explain user impact or important release behavior.
- Mention technical details only when they are part of the user-facing surface, such as a command, environment variable, JSON field, agent integration, package export, or platform.
- Avoid entries like `Implemented requested OpenCode refactor`; write `Added the OpenCode init command for installing the /codex-limits agent integration`.

Attribution:

- Internal issue fixes: `Fixed usage reset formatting ([#123](https://github.com/simonesiega/codex-limits/issues/123))`
- External contributions: `Added support for another agent ([#456](https://github.com/simonesiega/codex-limits/pull/456) by [@username](https://github.com/username))`
