# Shell Completions

Tab completion for Matrix CLI.

## Bash

Add to `~/.bashrc`:

```bash
source ~/.claude/matrix/completions/matrix.bash
```

## Zsh

Add to `~/.zshrc`:

```bash
fpath=(~/.claude/matrix/completions $fpath)
autoload -Uz compinit && compinit
```

## Fish

Copy to completions directory:

```bash
cp ~/.claude/matrix/completions/matrix.fish ~/.config/fish/completions/
```
