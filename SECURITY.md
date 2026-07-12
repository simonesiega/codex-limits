<h1 align="center">
  Security Policy
</h1>

<p align="center">
  Responsible disclosure guidelines for <strong>codex-limits</strong>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Security-private%20reporting-red" alt="Private security reporting" />
  <img src="https://img.shields.io/badge/Data%20access-read--only-blue" alt="Read-only data access" />
  <img src="https://img.shields.io/badge/Supported-latest%20release%20%7C%20main-brightgreen" alt="Supported versions: latest release and main" />
  <img src="https://img.shields.io/github/license/simonesiega/codex-limits" alt="License" />
</p>

## Supported versions

Security fixes are handled for the latest published version of `@simonesiega/codex-limits` and for the current `main` branch.

| Version            | Support                        |
| ------------------ | ------------------------------ |
| Latest npm release | Supported                      |
| `main` branch      | Supported for unreleased fixes |
| Older releases     | Best effort only               |

## Reporting a vulnerability

If you discover a vulnerability, a way to expose private Codex data, or a behavior that could leak sensitive information, do not open a public issue.

Report it privately using one of the following methods:

| Contact                             | Value                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| GitHub private vulnerability report | [Submit a private report](https://github.com/simonesiega/codex-limits/security/advisories) |
| Email                               | [simonesiega1@gmail.com](mailto:simonesiega1@gmail.com)                                    |

Do not include real access tokens, credentials, or unredacted private Codex files in the report. Use redacted examples whenever possible.

Please include:

| Field                | Why it matters                                                            |
| -------------------- | ------------------------------------------------------------------------- |
| Short description    | Explains what the issue is.                                               |
| Impact               | Explains what data, command, output, or integration is affected.          |
| Reproduction steps   | Makes the issue easier to verify and fix.                                 |
| Environment          | Helps isolate OS, Bun, Node, Codex, terminal, or agent-specific behavior. |
| Suggested mitigation | Optional, but useful if you already found a safe fix.                     |

## What to expect

After receiving a report, the maintainer will:

1. Confirm receipt of the report.
2. Investigate and reproduce the issue.
3. Share relevant progress when possible.
4. Coordinate a fix and disclosure before publishing details.

Please do not publicly disclose the vulnerability until a fix is available or disclosure has been coordinated. No specific response time is promised, but reports will be handled as promptly as reasonably possible.

## Local data and network behavior

`codex-limits` is designed to keep Codex data on your machine.

The CLI performs bounded, read-only inspection of recognized Codex home candidates. It reads small non-sensitive JSON state files, bounded `sessions/**/rollout-*.jsonl` logs, and `auth.json` only for credential resolution. Traversal depth, directory entries, file counts, file sizes, JSONL line sizes, and response sizes are limited; nested symbolic links are skipped. Raw local files and credentials are never returned by the public CLI or JSON contracts.

For live usage and coupon information, the project contacts the default ChatGPT Codex endpoints. The only endpoint override is `CODEX_LIMITS_USAGE_ENDPOINT`, mainly for testing or advanced setups. Overrides must use HTTPS, except for loopback HTTP during local testing. Authenticated requests reject redirects, use bounded timeouts and responses, and never include credential headers in diagnostics.

Agent integrations follow the same safety model: they should display a read-only summary by reusing the shared core, not send private Codex data to the agent, and not expose sensitive values inside the agent UI.

## What to report

Please report any issue that could expose private data or break the read-only safety model of the project.

Relevant examples include:

- access tokens printed in terminal output, JSON output, logs, tests, or screenshots;
- account IDs exposed without redaction;
- auth headers, cookies, or private environment values reaching user-visible output;
- raw local Codex files being printed, logged, snapshotted, or committed;
- agent integrations exposing private Codex data inside the agent UI;
- unexpected writes to local Codex data;
- unexpected network behavior related to usage or coupon discovery;
- unsafe handling of `CODEX_LIMITS_HOME`, `CODEX_LIMITS_ACCESS_TOKEN`, `CODEX_LIMITS_ACCOUNT_ID`, or `CODEX_LIMITS_USAGE_ENDPOINT`.

## Safety expectations

`codex-limits` is intended to be safe by default.

The project should:

- remain read-only for local Codex data;
- keep sensitive values out of CLI output, TUI output, JSON output, tests, logs, and screenshots;
- centralize data discovery, parsing, normalization, warnings, and redaction in the shared core;
- keep agent integrations thin and reuse the shared core instead of reimplementing security-sensitive parsing;
- use placeholders or redacted values in documentation, examples, and test fixtures;
- convert network, payload, authentication, and filesystem failures into deterministic safe warnings rather than raw exception messages.
