# Codex Limits Documentation

[← Project README](../README.md) · [npm package](https://www.npmjs.com/package/@simonesiega/codex-limits)

This documentation is organized by task. The root README is the product overview. [Compatibility](readme/compatibility.md) is canonical for support requirements, [`SECURITY.md`](../SECURITY.md) is canonical for deep safety behavior, [Troubleshooting](readme/troubleshooting.md) is the cross-surface diagnosis guide, and each individual agent page is canonical for that integration's setup, removal, and troubleshooting.

## Start here

- **Installing or using the CLI?** Begin with the [quick start](../README.md#quick-start), then use the [command reference](../README.md#usage).
- **Writing a script or integration?** Read [JSON output](readme/json-output.md) and use the schema for [complete limits](schema/codex-limits.schema.json), [coupons](schema/codex-limits-coupons.schema.json), or [doctor diagnostics](schema/codex-limits-doctor.schema.json).
- **Installing or removing an agent command?** Open the [agent integrations guide](readme/agent-integrations.md), then choose [OpenCode](readme/agents/opencode.md), [pi](readme/agents/pi.md), or [GitHub Copilot CLI](readme/agents/copilot.md).
- **Diagnosing an environment?** Run `codex-limits doctor`, then use [Troubleshooting](readme/troubleshooting.md) and check the relevant [compatibility requirements](readme/compatibility.md).
- **Contributing?** Start with [`CONTRIBUTING.md`](../CONTRIBUTING.md) and review the [security policy](../SECURITY.md).

## CLI and automation

| Guide                                        | Use it when                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Quick start](../README.md#quick-start)      | Installing the published package and opening the dashboard for the first time.                   |
| [Command reference](../README.md#usage)      | Using `status`, `coupons`, `reset`, `doctor`, `agents`, or the compatible `init` command.        |
| [JSON output](readme/json-output.md)         | Consuming stable machine-readable limits, coupon, or doctor documents.                           |
| [Compatibility](readme/compatibility.md)     | Checking Node.js, operating-system, terminal, Codex-data, network, or agent requirements.        |
| [Troubleshooting](readme/troubleshooting.md) | Resolving Codex data, authentication, network, coupon, terminal, JSON, reset, or agent problems. |

## Agent integrations

| Guide                                              | Covers                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Agent integrations](readme/agent-integrations.md) | Supported-agent index, shared lifecycle modes, adapter architecture, and contribution rules. |
| [OpenCode](readme/agents/opencode.md)              | Canonical OpenCode setup, usage, removal, and troubleshooting.                               |
| [pi](readme/agents/pi.md)                          | Canonical pi setup, usage, removal, and troubleshooting.                                     |
| [GitHub Copilot CLI](readme/agents/copilot.md)     | Canonical Copilot CLI setup, usage, removal, and troubleshooting.                            |

## Development and security

| Guide                              | Covers                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Contributing](../CONTRIBUTING.md) | Repository setup, architecture boundaries, tests, documentation rules, and pull-request expectations. |
| [Security](../SECURITY.md)         | Responsible disclosure, local-data and network boundaries, command safety, and release security.      |
| [Changelog](../CHANGELOG.md)       | Released behavior and current unreleased changes.                                                     |

## Schemas, examples, and visual assets

| Resource                                                                                                                  | Purpose                                         |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [Complete limits example](examples/codex-limits-output.example.json) and [schema](schema/codex-limits.schema.json)        | Resources for validating `codex-limits --json`. |
| [Coupon example](examples/codex-limits-coupons-output.example.json) and [schema](schema/codex-limits-coupons.schema.json) | Resources for validating `coupons --json`.      |
| [Doctor example](examples/codex-limits-doctor-output.example.json) and [schema](schema/codex-limits-doctor.schema.json)   | Resources for validating `doctor --json`.       |
| [`photos/`](photos/)                                                                                                      | README screenshots and project identity assets. |

Visual assets are grouped by purpose:

```text
photos/
├── agents/    # Supported agent integration screenshots
├── logo/      # Project identity and animated README title
└── terminal/  # Responsive terminal dashboard screenshots
```

## Documentation conventions

- Commands are shown from the repository root unless a guide says otherwise.
- Keep internal repository links relative and route readers through this hub when no more specific canonical guide exists.
- Treat the root [Usage](../README.md#usage) section and generated `--help` output as the command reference; do not duplicate complete command procedures across guides.
- Keep deep data-access, network, redaction, installer, and mutation safeguards canonical in [`SECURITY.md`](../SECURITY.md); summarize and link elsewhere.
- Keep runtime, operating-system, Codex-data, network, terminal, and host support requirements canonical in [Compatibility](readme/compatibility.md).
- Keep cross-surface diagnosis in [Troubleshooting](readme/troubleshooting.md), while agent-specific installation, configuration, removal, and troubleshooting remain canonical in the matching page under [`readme/agents/`](readme/agents/).
- Keep JSON field claims synchronized with [JSON output](readme/json-output.md) and each command's schema and sanitized example.
- Use placeholders in examples. Never include tokens, account IDs, authorization headers, cookies, private paths, raw Codex files, or unredacted environment values.
- Use repository-relative image paths and descriptive alt text. Screenshots must contain only synthetic or safely redacted data.
- Run `bun run docs:check` after documentation changes.
