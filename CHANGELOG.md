# Changelog

All notable changes to codex-limits are documented in this file.

## [Unreleased]

### Breaking Changes

### Added

### Changed

### Fixed

### Removed

### Security

## [0.1.4] - 2026-07-13

### Added

- Added responsive dashboard layouts for wide, compact, short, and very small terminals.
- Added GitHub Actions checks and npm Trusted Publishing workflows.
- Added consistent Prettier formatting and package-artifact smoke validation.

### Changed

- Changed npm artifacts to use self-contained runtime bundles and TypeScript-generated root plugin declarations, reducing installation dependencies while preserving the default and named `tui` exports.
- Changed `bun run check` to verify formatting, types, tests, production builds, package metadata, and isolated packed artifacts.
- Changed malformed, duplicate, conflicting, and extra CLI arguments to fail deterministically on stderr.

### Fixed

- Fixed partial live usage windows being discarded when local usage data was unavailable.
- Fixed malformed, oversized, timed-out, aborted, and non-successful live responses to produce stable warnings and safe local fallback behavior.
- Fixed OpenCode registration and disposal to remain idempotent while supporting both command APIs.

### Security

- Bounded local traversal, file sizes, JSONL line sizes, credential files, and live response bodies while skipping nested symbolic links.
- Prevented authenticated redirects, rejected unsafe endpoint protocols, and removed raw exception details from CLI and OpenCode errors.
- Strengthened warning and JSON redaction so credentials, private paths, authenticated headers, and internal source metadata do not reach public output.

## [0.1.3] - 2026-07-09

### Fixed

- Fixed `codex-limits init --opencode` to install the scoped OpenCode plugin package.
- Fixed OpenCode command registration to keep `/codex-limits` available with both legacy and current TUI plugin APIs.

## [0.1.0] - 2026-07-05

### Added

- Added the shared core API for Codex usage limits and reset-credit coupons.
- Added the read-only Ink terminal dashboard with usage limit cards and reset coupon panels.
- Added non-interactive `status`, `coupons`, and JSON command output.
- Added an opencode plugin that registers `/codex-limits` without sending a prompt to the LLM.
- Added `codex-limits init` and npm postinstall setup for optional agent integrations.
