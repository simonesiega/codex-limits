# Changelog

All notable changes to codex-limits are documented in this file.

## [Unreleased]

### Breaking Changes

### Added

- Added explicit OpenCode, pi, and GitHub Copilot CLI package subpath exports while keeping the package root dedicated to OpenCode loading and the internal core private.

### Changed

- Changed package safety messaging to distinguish read-only inspection commands from the explicitly confirmed `reset` remote mutation.
- Changed packed-runtime checks to validate the packed CLI on macOS with Node.js 22.

### Fixed

- Fixed packed-package validation for canonical temporary-directory paths on macOS.

### Removed

### Security

## [1.0.0] - 2026-07-23

### Added

- Added `codex-limits reset` for consuming a numbered or soonest-expiring reset coupon after an interactive recap and explicit `y` confirmation.
- Added the GitHub Copilot CLI integration with `codex-limits agents install copilot` and a read-only `/codex-limits` extension command that does not send limit data to the LLM.
- Added a task-oriented documentation hub and included the complete guides, JSON Schema, and sanitized example in published npm packages.
- Added weekly Dependabot updates for the Bun dependency graph.

### Changed

- Changed the packaged OpenCode runtime entry point to the agent-specific `dist/opencode.js` bundle while preserving the package root plugin exports.
- Changed `codex-limits doctor` text output to align every diagnostic value with the longest integration label.

### Fixed

- Fixed local session fallback to select the newest bounded event timestamp when file modification times are misleading.
- Fixed combined dashboard loading to start independent usage and reset-coupon requests concurrently.

### Security

- Hardened bounded session and native HTTP reads against path-replacement races and unbounded error-body draining, and made `reset --soonest` fail closed when coupon expirations cannot be verified.
- Prevented private Codex paths, free-form local reset text, and malformed coupon timestamp content from reaching public output.
- Required manual npm publishing runs to use the version tag matching the package metadata.

## [0.1.6] - 2026-07-22

### Breaking Changes

### Added

- Added `codex-limits doctor` and `codex-limits doctor --json` for safe environment, connectivity, local usage, authentication, OpenCode, and pi integration diagnostics.
- Added the pi agent integration with `codex-limits agents install pi` and a read-only `/codex-limits` overlay that does not send limit data to the LLM.

### Changed

### Fixed

### Removed

### Security

## [0.1.5] - 2026-07-22

### Breaking Changes

### Added

- Added bundled third-party license notices to published package artifacts.
- Added the `codex-limits agents` command group with named, interactive, and all-agent integration installation while keeping the existing `init` syntax supported.

### Changed

- Changed CI to run source checks once and validate packed artifacts across Node.js 20, 22, and 24 on Linux and Windows.
- Changed CLI parsing and help to use one command definition source, with generated nested help and order-independent supported options.

### Fixed

- Fixed authenticated request cancellation when a caller abort coincided with request startup.
- Fixed CLI help to describe credential overrides for both live usage and reset-credit requests.
- Fixed very small text dashboards to stay within the available terminal rows when coupon entries are truncated.
- Fixed Windows checkouts to preserve LF line endings so local formatting checks remain stable.
- Fixed weekly-only usage data to use declared window durations across live and local sources, avoid stale local fallback for recognized live windows, and omit unavailable 5-hour sections from terminal dashboards and the OpenCode integration.
- Fixed clean production builds and kept terminal rendering compatible with Node.js 20.

### Removed

### Security

- Refused symbolic-link files and path-replacement races when reading bounded local files, including agent configurations.
- Disabled dependency lifecycle scripts during CI installs, pinned workflow actions to immutable commits, and explicitly requested npm provenance for published packages.
- Shortened agent configuration paths under the user home to `~/...` and redacted paths outside it before printing installation results.
- Sanitized and bounded command and agent errors, and rejected control characters in command metadata before terminal output.

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
