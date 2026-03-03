---
name: RunMD
description: This skill should be used when the user asks to "run markdown", "execute markdown", "run playbook", "runmd", "test markdown", "execute code blocks", "run shell blocks", or needs to execute shell code blocks from markdown files.
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# RunMD

Execute shell code blocks from markdown files using [runmd](https://github.com/ojowwalker77/runmd).

## Usage

Parse user arguments: `<file.md> [options]`

- **file**: Path to a markdown file containing shell code blocks
- **--headless**: Run in non-interactive mode (default when invoked from here)
- **--fail-fast**: Stop on first block failure
- **--blocks 0,2,5**: Run only specific block indices (0-based)

## Process

1. Confirm `runmd` is installed: `which runmd || bun install -g runmd`
2. If no file specified, search for markdown files with shell blocks:
   ```
   Find *.md files, scan for ```bash/```sh/```zsh/```shell code fences
   ```
3. Show the user which shell blocks exist in the file (list them with indices)
4. Execute: `runmd run <file.md> [--fail-fast] [--blocks <indices>]`
5. Report results — pass/fail per block with exit codes

## Shell Block Detection

Executable code fences use these languages:
- ```bash
- ```sh
- ```zsh
- ```shell

Other code blocks (js, python, etc.) are display-only and not executed.

## Environment Variables

runmd auto-loads `.env` files from the markdown file's directory. Variables referenced as `${VAR_NAME}` in shell blocks are substituted before execution.

## Modes

| Mode | Command | Use Case |
|------|---------|----------|
| Headless | `runmd run <file>` | CI/CD, automation, scripted execution |
| Interactive | `runmd <file>` | Manual exploration, editing, step-by-step |

Default to **headless** mode (`runmd run`) when executing from this skill. Suggest **interactive** mode if the user wants to explore or edit.

## Notes

- Exit code 1 if any block fails in headless mode
- `--fail-fast` stops at the first failure instead of running all blocks
- `--blocks` accepts comma-separated 0-based indices to run selectively
