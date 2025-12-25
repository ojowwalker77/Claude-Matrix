---
description: Export Matrix memory to file
---

# Matrix Export

Export the Matrix memory database to a portable format.

Arguments: `$ARGUMENTS`

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
