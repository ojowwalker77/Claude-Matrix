---
description: Search Matrix memory for relevant solutions
---

# Matrix Search

Search the Matrix memory system for solutions related to: "$ARGUMENTS"

Use the `matrix_recall` MCP tool to find relevant past solutions. Present the results in a clear format showing:

- **Solution ID** - for reference
- **Problem** - what was solved
- **Solution summary** - how it was solved
- **Success rate** - percentage of successful uses
- **Similarity score** - how relevant to the query

If no arguments provided, ask the user what problem they're trying to solve.

If no solutions are found, suggest the user can store new solutions with `matrix_store` after solving their problem.
