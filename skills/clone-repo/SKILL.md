---
name: Clone Repo
description: This skill should be used when the user asks to "clone a repo", "fetch code from github", "get external code", "look at a repo", or needs to explore an external repository for code examples and patterns.
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# Clone Repo

Clone an external repository for exploration and code reference.

## Usage

Parse user arguments: `<repo> [branch]`

- **repo**: GitHub `owner/repo` or full URL
- **branch** (optional): specific branch to clone

## Process

1. Create `temp/` directory in project root (gitignored)
2. Shallow clone: `git clone --depth 1 [--branch <branch>] <repo> temp/<repo-name>`
3. Explore, read, and search the cloned code as needed
4. When done, clean up: `rm -rf temp/<repo-name>`

## Notes

- Always use `--depth 1` to minimize download size
- Clean up when finished — don't leave cloned repos around
- If `temp/` doesn't exist in `.gitignore`, add it
