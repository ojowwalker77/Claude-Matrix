---
name: Matrix List
description: This skill should be used when the user asks to "list matrix solutions", "show matrix stats", "display memory contents", "view matrix status", "show failures", "list warnings", or needs to see Matrix memory statistics.
user-invocable: true
agent: haiku
allowed-tools:
  - mcp__plugin_matrix_matrix__matrix_status
  - mcp__plugin_matrix_matrix__matrix_warn
---

# Matrix List

Display Matrix memory contents and statistics.

Use the `matrix_status` MCP tool to retrieve comprehensive information and present it to the user.

## Default View (no arguments)

Display:
- **Statistics**: Total solutions, failures recorded, warnings count
- **By Scope**: Solutions breakdown (global/stack/repo)
- **Recent Activity**: Last 5 solutions
- **Top Performers**: Solutions with highest success rates
- **Database**: Size and health status

## Argument-Based Filtering

Parse user arguments from the skill invocation. When Claude Code loads this skill, the user's additional text after the trigger phrase is available for parsing.

Based on user input, adjust the listing:
- Contains "stats" or "statistics" - focus on statistics only
- Contains "failure" - focus on recorded failures
- Contains "warn" - use `matrix_warn` tool with action "list" to show warnings
- Contains "solutions" - show detailed solutions list
- Otherwise - show comprehensive overview

Format the output as a clear, organized summary that helps the user understand their accumulated knowledge.
