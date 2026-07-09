# Changelog

All notable changes to codex-limits are documented in this file.

## [Unreleased]

### Breaking Changes

### Added

- Added GitHub Actions workflows for repository checks and npm package publishing with Trusted Publishing.
- Prettier formatting to keep the codebase consistent.

### Changed

### Fixed

### Removed

### Security

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
