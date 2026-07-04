# AGENTS.md

## Purpose

This project (`codex-limits`) is a terminal-first CLI for checking local Codex usage windows and reset information.

The goal is to make Codex limit visibility easier to access from the terminal through a small, polished npm package.

## Core Priorities

Safety first.

Never print secrets, tokens, cookies, API keys, auth headers, raw session files, or sensitive local file contents.

Reliability first.

Missing files, unsupported environments, invalid JSON, permission errors, and incomplete local data should produce helpful messages instead of crashes.

Simplicity first.

This is a CLI package, not a platform. Keep the architecture small and easy to understand.

If a tradeoff is required, choose correctness, privacy, and maintainability over convenience.

## Product Scope

The package should provide a command named:

```bash
codex-limits
```

Primary usage:

```bash
npx codex-limits
```

Expected MVP commands:

```bash
codex-limits
codex-limits --json
codex-limits doctor
codex-limits --help
codex-limits --version
```

The default command should print a human-readable summary.

`--json` should print valid JSON only.

`doctor` should explain what local Codex data was found, what is missing, and what the user can try next.

Do not add GUI, database, auth, telemetry, analytics, background processes, dashboards, or network calls unless the user explicitly asks for them.

## Tech Stack

Runtime and package manager:

- Bun

Language:

- TypeScript

Target runtime:

- Node.js

Package target:

- npm package with a CLI `bin` entry

Use Bun for package management and scripts:

```bash
bun install
bun run dev
bun run build
bun run typecheck
bun test
```

Do not mix npm, yarn, or pnpm for development workflows unless external publishing tooling requires it.

## High-Level Architecture

Suggested structure:

```txt
src/cli.ts              → CLI entry point and argument routing
src/index.ts            → public exports
src/types.ts            → shared domain types
src/codex-home.ts       → local Codex directory detection
src/read-codex-state.ts → safe local file reading
src/parse-limits.ts     → normalized limit parsing
src/format-human.ts     → terminal output formatting
src/format-json.ts      → JSON output formatting
src/doctor.ts           → diagnostics
tests/                  → unit tests with fake fixtures only
docs/                   → optional documentation
```

Keep modules focused.

The CLI entry file should stay thin. It should parse arguments, call the correct module, handle top-level errors, and set exit codes.

Filesystem logic belongs in dedicated modules.

Parsing logic belongs in dedicated modules.

Formatting logic should be pure and testable.

## Runtime Model

The tool runs locally on the user’s machine.

It may inspect local Codex-related files.

It must not mutate Codex files.

It must not write into Codex directories.

It must not send local data over the network.

It must not attempt to bypass, reset, increase, or manipulate rate limits.

The tool only observes available local information and reports it clearly.

## Package Rules

The npm package should expose this command:

```json
{
  "bin": {
    "codex-limits": "./dist/cli.js"
  }
}
```

The built CLI must include a shebang:

```ts
#!/usr/bin/env node
```

Prefer these scripts:

```json
{
  "scripts": {
    "dev": "bun run src/cli.ts",
    "build": "bun build src/cli.ts --target=node --outfile=dist/cli.js",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "check": "bun run typecheck && bun test && bun run build"
  }
}
```

Before saying the work is complete, run:

```bash
bun run typecheck
bun test
bun run build
```

If available, also run:

```bash
bun run check
```

## CLI Behavior

Default output should be readable, calm, and honest.

If data is unavailable, say `unknown` or explain that it could not be detected.

Never invent percentages, reset times, or usage windows.

Good default output shape:

```txt
Codex Limits

Status: partial

Primary window:
Used: unknown
Resets at: unknown
Resets in: unknown

Secondary window:
Used: unknown
Resets at: unknown
Resets in: unknown

Source: local Codex files
Note: Some values may be unavailable if Codex does not expose them locally.
```

JSON output must contain JSON only.

Good JSON shape:

```json
{
  "status": "partial",
  "source": "local",
  "primary": {
    "used": null,
    "resetsAt": null,
    "resetsIn": null
  },
  "secondary": {
    "used": null,
    "resetsAt": null,
    "resetsIn": null
  },
  "warnings": []
}
```

`doctor` should check:

- candidate Codex paths
- custom `CODEX_LIMITS_HOME`
- readable local files
- whether useful limit data can be parsed
- permission or format problems
- next-step suggestions

## Code Standards

Use TypeScript everywhere.

Prefer:

- strict types
- clear names
- small functions
- early returns
- pure formatting functions
- fake fixtures for tests
- readable control flow
- `const` over `let`
- `unknown` over `any`
- `import type` for type-only imports
- kebab-case file names

Avoid:

- `any`
- large functions
- noisy logs
- clever abstractions
- hidden global state
- deep dependency chains
- mixing filesystem, parsing, and formatting logic in one function
- raw stack traces for expected user errors

Add small TSDoc comments to exported functions and exported types when they are part of the project API.

## File and Import Rules

Use kebab-case for files and folders.

Do not create local barrel files unless explicitly useful.

Do not include `.ts` extensions in imports.

Keep imports simple and maintainable.

Prefer direct local imports over complicated alias setup unless the project already has aliases configured.

Read relevant files before editing them. Do not rely only on search snippets for broad changes.

Always ask before removing functionality that appears intentional.

## Security Rules

Never print or commit:

- tokens
- cookies
- API keys
- auth headers
- raw auth files
- raw session files
- real Codex state files
- sensitive environment variables

Never add:

- telemetry
- analytics
- automatic upload behavior
- network calls
- private endpoint calls
- background daemons

Tests must use fake data only.

If a fixture needs a secret-like value, use clearly fake placeholder data.

When in doubt, redact.

## Testing Rules

Tests are required for meaningful behavior.

Test at least:

- default command result formatting
- JSON output validity
- unknown values as `null` in JSON
- unknown values as `unknown` in human output
- missing Codex directory handling
- custom `CODEX_LIMITS_HOME`
- invalid JSON handling
- partial data handling
- unavailable data handling
- no secret-like values printed

Use fake fixtures only.

Do not depend on the developer’s real Codex installation.

Do not commit real local files.

## Maintainability

Long-term maintainability is a core priority.

Before adding new logic, check whether existing modules can be reused.

Avoid duplicated parsing, formatting, path detection, and error handling logic.

Do not over-engineer, but do not solve problems by scattering one-off logic everywhere.

Prefer small, well-named modules with clear responsibilities.

## Changelog

If the repository has `CHANGELOG.md`, update it for user-facing release-relevant changes.

Add entries under:

```md
## [Unreleased]
```

Use sections when present:

```md
### Added
### Changed
### Fixed
### Removed
```

Do not add changelog entries for purely internal refactors, tests, or documentation-only changes unless they affect released behavior.

Keep changelog entries concise and product-facing.