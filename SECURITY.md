<h1 align="center">
  Security Policy
</h1>

<p align="center">
  Responsible disclosure guidelines for <strong>codex-limits</strong>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Security-private%20reporting-red" alt="Private security reporting" />
  <img src="https://img.shields.io/badge/Project-read--only-blue" alt="Read-only project" />
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

Report it privately to the maintainer:

| Contact | Value                                                   |
| ------- | ------------------------------------------------------- |
| Email   | [simonesiega1@gmail.com](mailto:simonesiega1@gmail.com) |
| GitHub  | [@simonesiega](https://github.com/simonesiega)          |

Please include:

| Field                | Why it matters                                                            |
| -------------------- | ------------------------------------------------------------------------- |
| Short description    | Explains what the issue is.                                               |
| Impact               | Explains what data, command, output, or integration is affected.          |
| Reproduction steps   | Makes the issue easier to verify and fix.                                 |
| Environment          | Helps isolate OS, Bun, Node, Codex, terminal, or agent-specific behavior. |
| Suggested mitigation | Optional, but useful if you already found a safe fix.                     |

## Local data and network behavior

`codex-limits` is designed to keep Codex data on your machine.

The CLI reads local Codex data only to discover the account and usage information required to show limits, reset times, and reset-credit coupons. It should never upload raw local Codex files, tokens, cookies, auth headers, account data dumps, or private environment values.

For live usage and coupon information, the project should only contact OpenAI-owned usage endpoints. The only exception is when a user explicitly overrides the endpoint with `CODEX_LIMITS_USAGE_ENDPOINT`, mainly for testing or advanced setups.

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
- use placeholders or redacted values in documentation, examples, and test fixtures.
