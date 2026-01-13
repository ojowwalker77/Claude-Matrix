---
name: Matrix Reindex
description: This skill should be used when the user asks to "reindex the codebase", "refresh code index", "update matrix index", "rebuild symbol index", or needs to manually trigger code indexing.
user-invocable: true
agent: haiku
allowed-tools:
  - mcp__plugin_matrix_matrix__matrix_reindex
---

# Matrix Reindex

Trigger a manual reindex of the TypeScript/JavaScript codebase.

Use the `matrix_reindex` MCP tool to refresh the code index.

## Arguments

- `full` (optional): If true, force a complete reindex ignoring incremental mode

## When to Use

- After making significant file changes outside of Claude
- When the index seems stale or incomplete
- After renaming or moving many files

## Output

- Files scanned, indexed, and skipped
- Symbols and imports found
- Duration of the indexing process
