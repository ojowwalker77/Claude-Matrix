---
name: Matrix Nuke
description: This skill should be used when the user asks to "nuke dead code", "find unused exports", "clean up imports", "find orphaned files", "detect circular deps", "cleanup codebase", "find unused packages", "remove dead code", "nuke this", "nuke unused", or needs comprehensive codebase hygiene analysis.
user-invocable: true
context: fork
allowed-tools:
  # Matrix Code Index
  - mcp__plugin_matrix_matrix__matrix_find_dead_code
  - mcp__plugin_matrix_matrix__matrix_find_circular_deps
  - mcp__plugin_matrix_matrix__matrix_find_callers
  - mcp__plugin_matrix_matrix__matrix_find_definition
  - mcp__plugin_matrix_matrix__matrix_search_symbols
  - mcp__plugin_matrix_matrix__matrix_list_exports
  - mcp__plugin_matrix_matrix__matrix_get_imports
  - mcp__plugin_matrix_matrix__matrix_index_status
  # Matrix Memory
  - mcp__plugin_matrix_matrix__matrix_recall
  - mcp__plugin_matrix_matrix__matrix_store
  - mcp__plugin_matrix_matrix__matrix_failure
  # Context7 - Library Documentation
  - mcp__plugin_matrix_context7__resolve-library-id
  - mcp__plugin_matrix_context7__query-docs
  # Standard Tools
  - Read
  - Grep
  - Glob
  - Bash
---

# Matrix Nuke

Comprehensive codebase hygiene analysis. Detects dead code, unused imports, orphaned files, circular dependencies, stale TODOs, unnecessary comments, overengineered dependencies, and more across 11 categories.

> **Tip:** This skill runs in a **forked context** for unbiased analysis - clean slate, no conversation history bias.

## Architecture

```
ORCHESTRATOR (parse mode, dispatch agents, aggregate report)
     |
     +-- STRUCTURAL AGENT --> dead exports, orphaned files, unused imports
     +-- CIRCULAR DEP AGENT --> import cycle detection
     +-- DEPENDENCY AGENT --> unused npm packages, overengineered deps
     +-- GENERATIVE AGENT --> comments, console.log, copy-paste, TODOs
     +-- TRIAGE AGENT --> confidence scoring, safety filtering, tiering
```

## Usage

Parse user arguments from the skill invocation (text after the trigger phrase).

**Expected format:** `/nuke [mode] [path]`

### Modes

| Mode | Command | Behavior |
|------|---------|----------|
| Scan | `/nuke` or `/nuke scan` | Report only - touch nothing (default) |
| This | `/nuke this <file>` | Single file analysis |
| Safe | `/nuke safe` | Report HIGH confidence only (>90%) |
| Aggressive | `/nuke aggressive` | Report MEDIUM+ confidence (>70%) |

### Path Filtering

Append a path to any mode to limit scope:
- `/nuke scan src/api/` - only scan src/api/
- `/nuke this src/utils/auth.ts` - single file

### Examples

```
/nuke                        # Full scan, report only
/nuke scan                   # Same as above
/nuke this src/utils/auth.ts # Single file analysis
/nuke scan src/api/          # Scan specific directory
/nuke safe                   # High-confidence findings only
/nuke aggressive             # Medium+ confidence findings
```

## Pipeline

Follow the orchestration detailed in `references/nuke-pipeline.md`:

1. **Pre-flight** - Check index availability (`matrix_index_status`), detect entry points from package.json, parse mode
2. **Structural Analysis** - Use `matrix_find_dead_code` for dead exports + orphaned files
3. **Circular Dep Detection** - Use `matrix_find_circular_deps` for import cycles
4. **Dependency Analysis** - Read package.json, cross-reference with actual imports via `Grep`
5. **Generative Analysis** - AI inspection of files for comments, console.log, duplication, TODOs
6. **Triage** - Apply safety rules, assign confidence scores, classify into tiers
7. **Report** - Generate formatted output per `references/output-format.md`

**Early exit for `/nuke this`:** Only run Structural + Generative agents on that single file. Skip dependency and circular dep analysis.

**Graceful degradation:** If index is unavailable, fall back to Grep-based analysis. Report reduced accuracy.

## What Gets Detected (11 Categories)

### Structural (deterministic, via MCP tools)
1. **Dead exports** - exported symbols with zero callers across the codebase
2. **Orphaned files** - files that nothing imports (excluding entry points)
3. **Circular dependencies** - import cycles in the dependency graph
4. **Unused npm packages** - in package.json but never imported
5. **Unused imports** - imports brought in but never referenced in the file

### Generative (AI judgment required)
6. **Unnecessary comments** - obvious/redundant comments (`// increment i`, `// constructor`)
7. **Commented-out code** - dead code hiding in comments (contains `{`, `=`, `function`, `return`)
8. **Console.log leftovers** - `console.log` and `console.debug` left from debugging (NOT `console.error`)
9. **Overengineered deps** - libraries replaceable with native APIs (`lodash.get` -> `?.`, `moment` -> `Intl`)
10. **Copy-paste duplication** - near-identical code blocks (5+ similar consecutive lines)
11. **Stale TODO/FIXME** - ancient TODOs with no linked issues and old git blame dates

## Safety Rules

See `references/safety-rules.md` for full details. Key rules:

- **Never flag entry points** - index.ts, main.ts, bin/*, package.json main/module/exports
- **Never flag framework conventions** - pages/*, routes/*, app/*, *.config.*, migrations/*
- **Never flag dynamically imported modules** - import(), require() references
- **Never flag public API surface** - root barrel exports, @public JSDoc
- **Respect .nukeignore** - if present, honor it like .gitignore

## Additional Resources

- **`references/nuke-pipeline.md`** - Full orchestrator pipeline
- **`references/agents/structural-agent.md`** - Dead code detection via MCP tools
- **`references/agents/generative-agent.md`** - AI-judged detection patterns
- **`references/agents/dependency-agent.md`** - Package analysis and native alternatives
- **`references/agents/triage-agent.md`** - Confidence scoring and safety filtering
- **`references/safety-rules.md`** - Entry point detection, what NOT to flag
- **`references/output-format.md`** - Report template
