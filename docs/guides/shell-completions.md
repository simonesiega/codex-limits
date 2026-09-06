# Shell completions

[← Documentation hub](../README.md) · [Project README](../../README.md)

Codex Limits generates completion scripts from the same command registry used by parsing and help, so commands, options, and supported argument choices stay synchronized. Bash, Zsh, Fish, PowerShell, and Nushell are supported.

## Try completions in the current session

Run the command for your shell after installing `codex-limits` globally.

### Bash

```bash
source <(codex-limits completions bash)
```

### Zsh

Initialize Zsh completion first if your configuration does not already do so:

```zsh
autoload -Uz compinit && compinit
source <(codex-limits completions zsh)
```

### Fish

```fish
codex-limits completions fish | source
```

### PowerShell

```powershell
codex-limits completions powershell | Out-String | Invoke-Expression
```

### Nushell

Nushell loads completion declarations from a file:

```nu
codex-limits completions nushell | save --force codex-limits-completions.nu
source codex-limits-completions.nu
```

Delete the temporary file when the session ends if you do not want to keep it.

## Install completions permanently

Generate a fresh file after upgrading Codex Limits so it reflects the installed CLI version.

### Bash

```bash
mkdir -p ~/.config/codex-limits
codex-limits completions bash > ~/.config/codex-limits/completion.bash
printf '\nsource ~/.config/codex-limits/completion.bash\n' >> ~/.bashrc
source ~/.bashrc
```

Add the `source` line only once if you regenerate the completion file later.

### Zsh

```zsh
mkdir -p ~/.zsh/completions
codex-limits completions zsh > ~/.zsh/completions/_codex-limits
```

Ensure these lines appear in `~/.zshrc`, before any existing `compinit` call:

```zsh
fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit
compinit
```

Then start a new shell or run `source ~/.zshrc`.

### Fish

```fish
mkdir -p ~/.config/fish/completions
codex-limits completions fish > ~/.config/fish/completions/codex-limits.fish
```

Fish loads files in that directory automatically for new sessions.

### PowerShell

```powershell
$completionDirectory = Split-Path -Parent $PROFILE
$completionFile = Join-Path $completionDirectory "codex-limits-completion.ps1"
$sourcePath = $completionFile.Replace("'", "''")
$sourceLine = ". '$sourcePath'"

New-Item -ItemType Directory -Force $completionDirectory | Out-Null
if (-not (Test-Path $PROFILE)) {
    New-Item -ItemType File $PROFILE | Out-Null
}
codex-limits completions powershell | Set-Content $completionFile

if ((Get-Content $PROFILE) -notcontains $sourceLine) {
    Add-Content $PROFILE $sourceLine
}

. $completionFile
```

The profile check makes the block idempotent: rerunning it refreshes the generated script without adding another dot-source line.

### Nushell

Write the generated declarations to Nushell's vendor autoload directory:

```nu
let completionDirectory = ($nu.data-dir | path join "vendor" "autoload")
mkdir $completionDirectory
codex-limits completions nushell
| save --force ($completionDirectory | path join "codex-limits.nu")
```

Nushell loads the file automatically in new interactive sessions.

## How it works

The completion feature has one metadata source and a small shell-specific rendering layer:

```text
command factories
      ↓
validated command registry
      ├── parser
      ├── generated help
      └── completion model → Bash, Zsh, Fish, PowerShell, or Nushell script
```

The registry in [`src/package/commands/command-registry.ts`](../../src/package/commands/command-registry.ts) composes every command definition. Those definitions already contain command paths, aliases, descriptions, options, positional arguments, allowed choices, and safety classifications. The completion formatter in [`src/package/commands/completions/format.ts`](../../src/package/commands/completions/format.ts) reads that metadata instead of maintaining another command list.

| Stage                 | Behavior                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Registry validation   | Rejects duplicate, ambiguous, or unsafe command metadata before a script can be generated.              |
| Completion generation | Collects command contexts, global and command options, aliases, and positional choices.                 |
| Shell rendering       | Emits native syntax for each supported shell; Nushell uses `extern` declarations and choice completers. |
| Command output        | `codex-limits completions <shell>` writes only the generated script to standard output.                 |

Generation is local and read-only. It does not inspect Codex data, load credentials, call network services, or install files. The installation commands above decide where to save or source the output.

The generated files are snapshots of the installed CLI's registry. Regenerate them after upgrading Codex Limits. Contributors add completion behavior by updating normal command metadata; renderer tests ensure newly registered commands, options, and choices reach generated output, while native shell parsers validate generated scripts containing awkward but permitted metadata.

## Verify or remove

Type `codex-limits` followed by a space, then press <kbd>Tab</kbd> to verify command completion. Subcommands, options, shell names, and supported agent IDs are completed from the current command definitions.

To remove completions, delete the generated file and remove the matching `source`, `fpath`, PowerShell profile, or Nushell autoload entry. Restart the shell afterward.

## Related documentation

- [Command reference](../../README.md#usage) — Public CLI commands and options.
- [Compatibility](compatibility.md#tested-shell-completion-generation) — Native parser validation and tested shell environments.
- [Contributing](../../CONTRIBUTING.md#code-guidelines) — Command registry and testing conventions.
- [Documentation hub](../README.md) — Task-oriented project documentation index.
