---
description: List solutions, statistics, and warnings
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
If the user provided arguments, adjust the listing:
- `$ARGUMENTS` contains "stats" or "statistics" → focus on statistics only
- `$ARGUMENTS` contains "failure" → focus on recorded failures
- `$ARGUMENTS` contains "warn" → use `matrix_warn` tool with action "list" to show warnings
- `$ARGUMENTS` contains "solutions" → show detailed solutions list
- Otherwise → show comprehensive overview

Format the output as a clear, organized summary that helps the user understand their accumulated knowledge.
