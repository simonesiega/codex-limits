# Codex Limits Documentation

[← Project README](../README.md) · [npm package](https://www.npmjs.com/package/@simonesiega/codex-limits)

This documentation is organized by task. The root README is the product overview; the guides below are the canonical references for automation, compatibility, agent integrations, and safe operation.

## Start here

- **Installing or using the CLI?** Begin with the [quick start](../README.md#quick-start), then use the [command reference](../README.md#usage).
- **Writing a script or integration?** Read [JSON output](readme/json-output.md) and use the versioned [JSON Schema](schema/codex-limits.schema.json).
- **Installing an agent command?** Open the [agent integrations guide](readme/agent-integrations.md), then choose [OpenCode](readme/agents/opencode.md), [pi](readme/agents/pi.md), or [GitHub Copilot CLI](readme/agents/copilot.md).
- **Diagnosing an environment?** Run `codex-limits doctor`, then check [compatibility](readme/compatibility.md) and [troubleshooting](../README.md#troubleshooting).
- **Contributing?** Start with [`CONTRIBUTING.md`](../CONTRIBUTING.md) and review the [security policy](../SECURITY.md).

## CLI and automation

| Guide                                           | Use it when                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Quick start](../README.md#quick-start)         | Installing the published package and opening the dashboard for the first time.            |
| [Command reference](../README.md#usage)         | Using `status`, `coupons`, `reset`, `doctor`, `agents`, or the compatible `init` command. |
| [JSON output](readme/json-output.md)            | Consuming stable machine-readable limits, coupon, or doctor documents.                    |
| [Compatibility](readme/compatibility.md)        | Checking Node.js, operating-system, terminal, Codex-data, network, or agent requirements. |
| [Troubleshooting](../README.md#troubleshooting) | Resolving missing local data, live-usage failures, permissions, or agent discovery.       |

## Agent integrations

| Guide                                              | Covers                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Agent integrations](readme/agent-integrations.md) | Shared installation modes, privacy guarantees, adapter architecture, and contribution rules.        |
| [OpenCode](readme/agents/opencode.md)              | Global configuration, `/codex-limits`, compatibility, removal, and troubleshooting.                 |
| [pi](readme/agents/pi.md)                          | Package registration, themed overlay behavior, host requirements, removal, and troubleshooting.     |
| [GitHub Copilot CLI](readme/agents/copilot.md)     | Experimental extension installation, host lifecycle, timeline output, removal, and troubleshooting. |

## Development and security

| Guide                              | Covers                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Contributing](../CONTRIBUTING.md) | Repository setup, architecture boundaries, tests, documentation rules, and pull-request expectations. |
| [Security](../SECURITY.md)         | Responsible disclosure, local-data and network boundaries, command safety, and release security.      |
| [Changelog](../CHANGELOG.md)       | Released behavior and current unreleased changes.                                                     |

## Schemas, examples, and visual assets

| Resource                                                           | Purpose                                                           |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [Complete JSON example](examples/codex-limits-output.example.json) | Sanitized example produced by `codex-limits --json`.              |
| [JSON Schema](schema/codex-limits.schema.json)                     | Draft 2020-12 schema for validating the complete limits document. |
| [`photos/`](photos/)                                               | README screenshots and project identity assets.                   |

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
- Keep JSON field claims synchronized with [JSON output](readme/json-output.md), the [schema](schema/codex-limits.schema.json), and the sanitized [example](examples/codex-limits-output.example.json).
- Use placeholders in examples. Never include tokens, account IDs, authorization headers, cookies, private paths, raw Codex files, or unredacted environment values.
- Use repository-relative image paths and descriptive alt text. Screenshots must contain only synthetic or safely redacted data.
- Run `bun run docs:check` after documentation changes.
