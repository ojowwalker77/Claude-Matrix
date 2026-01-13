---
name: Matrix Export
description: This skill should be used when the user asks to "export matrix data", "backup matrix", "export solutions", "export failures", "export warnings", or needs to export Matrix memory to a portable format.
user-invocable: true
agent: haiku
allowed-tools:
  - mcp__plugin_matrix_matrix__matrix_status
  - Write
---

# Matrix Export

Export the Matrix memory database to a portable format.

Parse user arguments from the skill invocation (text after the trigger phrase).

## Export Options

**JSON export** (default):
Read the database and output all solutions, failures, and warnings as JSON.

**Specific type** ("solutions", "failures", "warnings"):
Export only that category.

## Process

1. Use `matrix_status` to get counts
2. Read and format the data
3. Present the JSON output or save to file if path specified

Note: This exports the data for backup/portability. The actual SQLite database is at `~/.claude/matrix/matrix.db`.
