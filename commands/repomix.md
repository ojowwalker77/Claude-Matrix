---
description: Pack external repositories for context with minimal token consumption
---

# Matrix Repomix

Pack external repositories for context using a two-phase flow that minimizes token consumption.

## Usage

Use the `matrix_repomix` MCP tool with the target repository and query.

### Phase 1: Index (No Tokens)

Call with `target` and `query` to get file suggestions:

```
target: "anthropics/anthropic-cookbook"
query: "tool use implementation"
```

Returns suggested files with token estimates. Ask the user to confirm before proceeding.

### Phase 2: Pack (With Confirmation)

After user confirms, call again with `confirmedFiles`:

```
target: "anthropics/anthropic-cookbook"
query: "tool use implementation"
confirmedFiles: ["path/to/file1.py", "path/to/file2.py"]
```

## Parameters

- **target** (required) - GitHub shorthand (owner/repo) or local path
- **query** (required) - What implementation to search for
- **branch** - Git branch (default: HEAD)
- **confirmedFiles** - Files to pack (from Phase 1)
- **maxTokens** - Maximum tokens for output (default: 30000)
- **maxFiles** - Maximum files to suggest (default: 15)
- **cacheTTLHours** - Cache duration (default: 24)

## Key Features

- Query-first semantic search using Matrix embeddings
- Token estimates BEFORE consumption
- Smart exclusions (tests, docs, configs, node_modules)
- GitHub API for file tree (no content fetch until pack)
- 24h cache for index, configurable for pack results
