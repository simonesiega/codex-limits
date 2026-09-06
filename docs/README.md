# Codex Limits Documentation

[← Project README](../README.md) · [npm package](https://www.npmjs.com/package/@simonesiega/codex-limits)

This documentation is organized by task. The root README is the product overview. [Compatibility](guides/compatibility.md) is canonical for support requirements, [`SECURITY.md`](../SECURITY.md) is canonical for deep safety behavior, [Troubleshooting](guides/troubleshooting.md) is the cross-surface diagnosis guide, and each individual agent page is canonical for that integration's setup, removal, and troubleshooting.

## Start here

- **Installing or using the CLI?** Begin with the [quick start](../README.md#quick-start), then use the [command reference](../README.md#usage).
- **Writing a script or integration?** Read [JSON output](guides/json-output.md) and use the schema for [complete limits](schema/codex-limits.schema.json), [coupons](schema/codex-limits-coupons.schema.json), or [doctor diagnostics](schema/codex-limits-doctor.schema.json).
- **Enabling command completion?** Follow the [Bash, Zsh, Fish, PowerShell, or Nushell setup](guides/shell-completions.md).
- **Installing or removing an agent command?** Open the [agent integrations guide](guides/agent-integrations.md), then choose [OpenCode](guides/agents/opencode.md), [pi](guides/agents/pi.md), or [GitHub Copilot CLI](guides/agents/copilot.md).
- **Diagnosing an environment?** Run `codex-limits doctor`, then use [Troubleshooting](guides/troubleshooting.md) and check the relevant [compatibility requirements](guides/compatibility.md).
- **Contributing?** Use [Finding work](../CONTRIBUTING.md#finding-work) to check for scoped issues, follow the [Code of Conduct](../CODE_OF_CONDUCT.md), use the [issue chooser](https://github.com/simonesiega/codex-limits/issues/new/choose) for genuine bug reports or focused improvements, and review the [security policy](../SECURITY.md).

## CLI and automation

| Guide                                            | Use it when                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [Quick start](../README.md#quick-start)          | Installing the published package and opening the dashboard for the first time.                   |
| [Command reference](../README.md#usage)          | Using `status`, `coupons`, `reset`, `doctor`, `completions`, `agents`, or compatible `init`.     |
| [JSON output](guides/json-output.md)             | Consuming stable machine-readable limits, coupon, or doctor documents.                           |
| [Shell completions](guides/shell-completions.md) | Installing generated completions and understanding registry-driven generation.                   |
| [Compatibility](guides/compatibility.md)         | Checking Node.js, operating-system, terminal, Codex-data, network, or agent requirements.        |
| [Troubleshooting](guides/troubleshooting.md)     | Resolving Codex data, authentication, network, coupon, terminal, JSON, reset, or agent problems. |

## Agent integrations

| Guide                                              | Covers                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Agent integrations](guides/agent-integrations.md) | Supported-agent index, shared lifecycle modes, adapter architecture, and contribution rules. |
| [OpenCode](guides/agents/opencode.md)              | Canonical OpenCode setup, usage, removal, and troubleshooting.                               |
| [pi](guides/agents/pi.md)                          | Canonical pi setup, usage, removal, and troubleshooting.                                     |
| [GitHub Copilot CLI](guides/agents/copilot.md)     | Canonical Copilot CLI setup, usage, removal, and troubleshooting.                            |

## Development and security

| Guide                                                                                                           | Covers                                                                                                |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Contributing](../CONTRIBUTING.md)                                                                              | Repository setup, architecture boundaries, tests, documentation rules, and pull-request expectations. |
| [Code of Conduct](../CODE_OF_CONDUCT.md)                                                                        | Community behavior, private conduct reporting, and enforcement guidelines.                            |
| [Security](../SECURITY.md)                                                                                      | Responsible disclosure, local-data and network boundaries, command safety, and release security.      |
| [Changelog](../CHANGELOG.md)                                                                                    | Released behavior and current unreleased changes.                                                     |
| [Issue forms](https://github.com/simonesiega/codex-limits/issues/new/choose)                                    | Structured bug reports and feature requests.                                                          |
| [Pull Request template](https://github.com/simonesiega/codex-limits/blob/main/.github/pull_request_template.md) | Required contribution context, validation, and safety checks.                                         |

## Schemas, examples, and visual assets

| Resource                                                                                                                  | Purpose                                                |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [Complete limits example](examples/codex-limits-output.example.json) and [schema](schema/codex-limits.schema.json)        | Resources for validating `codex-limits --json`.        |
| [Coupon example](examples/codex-limits-coupons-output.example.json) and [schema](schema/codex-limits-coupons.schema.json) | Resources for validating `coupons --json`.             |
| [Doctor example](examples/codex-limits-doctor-output.example.json) and [schema](schema/codex-limits-doctor.schema.json)   | Resources for validating `doctor --json`.              |
| [`assets/`](assets/)                                                                                                      | Documentation screenshots and project identity assets. |

Visual assets are grouped by purpose:

```text
assets/
├── agents/    # Supported agent integration screenshots
├── logo/      # Project identity and animated README title
└── terminal/  # Responsive terminal dashboard screenshots
```

Contributors should follow the [documentation conventions](../CONTRIBUTING.md#documentation-changes) in `CONTRIBUTING.md`.
