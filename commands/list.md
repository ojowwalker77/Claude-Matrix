---
description: List stored solutions and memories
---

# Matrix List

List the solutions stored in Matrix memory.

Use the `matrix_status` MCP tool first to get overall statistics, then help the user explore their stored knowledge.

Display:
- Total solutions count
- Total failures recorded
- Recent solutions (last 5)
- Top-rated solutions by success rate

If the user provided arguments like "failures" or "warnings", adjust the listing accordingly:
- `$ARGUMENTS` contains "failure" → focus on recorded failures
- `$ARGUMENTS` contains "warn" → use `matrix_warn_list` to show warnings
- Otherwise → show solutions overview
