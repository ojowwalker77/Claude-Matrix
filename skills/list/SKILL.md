---
name: Matrix List
description: This skill should be used when the user asks to "list matrix solutions", "show matrix stats", "display memory contents", "view matrix status", "show failures", "list warnings", "export matrix data", "backup matrix", "export solutions", or needs to see or export Matrix memory.
user-invocable: true
agent: haiku
allowed-tools:
  - mcp__plugin_matrix_matrix__matrix_status
  - mcp__plugin_matrix_matrix__matrix_warn
  - Write
---

# Matrix List & Export

Display or export Matrix memory contents and statistics.

## List (default)

Use `matrix_status` to retrieve information and present it to the user.

- **No arguments**: Show statistics, scope breakdown, recent solutions, top performers
- **"stats"**: Focus on statistics only
- **"failures"**: Focus on recorded failures
- **"warnings"**: Use `matrix_warn` with action "list" to show warnings
- **"solutions"**: Show detailed solutions list

## Export

When the user says "export" or "backup":

1. Use `matrix_status` to get all data
2. Format as JSON
3. Use `Write` to save to the specified path (or default to `matrix-export.json`)
