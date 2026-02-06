# Nuke Pipeline

Full orchestration pipeline for the Matrix Nuke skill.

## Phase 0: Pre-flight

Before dispatching any agents:

1. **Check index availability**
   ```
   matrix_index_status()
   ```
   - If indexed: proceed with full pipeline
   - If not indexed: warn user, fall back to Grep-based analysis with reduced accuracy

2. **Parse mode and target**
   - Extract mode from arguments: `scan` (default), `this`, `safe`, `aggressive`
   - Extract path filter if provided
   - For `/nuke this <file>`: validate file exists

3. **Detect entry points**
   - Read `package.json` for `main`, `module`, `exports`, `bin` fields
   - Detect framework (Next.js, Remix, Astro, Vite, Express) from dependencies
   - Build entry point list to pass to `matrix_find_dead_code`

4. **Check Matrix memory**
   ```
   matrix_recall({ query: "dead code cleanup patterns", limit: 2 })
   ```
   - Load any relevant past cleanup patterns

## Phase 1: Structural Analysis

Launch the **Structural Agent** (see `agents/structural-agent.md`).

### Dead Exports + Orphaned Files
```
matrix_find_dead_code({
  category: "all",
  path: <path_filter>,
  entryPoints: <detected_entry_points>,
  limit: 100
})
```

### Circular Dependencies
```
matrix_find_circular_deps({
  path: <path_filter>,
  maxDepth: 10
})
```

**For `/nuke this` mode:** Skip `matrix_find_circular_deps`. Instead, use `matrix_get_imports` on the target file and `matrix_find_callers` for each of its exports to check for dead code in that specific file.

## Phase 2: Dependency Analysis

Launch the **Dependency Agent** (see `agents/dependency-agent.md`).

1. Read `package.json` dependencies and devDependencies
2. For each package, search for imports:
   ```
   Grep({ pattern: "from ['\"]<package>", glob: "*.{ts,tsx,js,jsx}" })
   ```
3. Check config files for non-import usage (webpack plugins, babel presets, jest config)
4. Check npm scripts for CLI tool usage
5. For used packages, check if they're overengineered:
   - Use Context7 to check for native alternatives
   - Flag single-function usage of utility libraries

**Skip for `/nuke this` mode.**

## Phase 3: Generative Analysis

Launch the **Generative Agent** (see `agents/generative-agent.md`).

For each file in scope (or just the target file for `/nuke this`):

1. Read the file content
2. Scan for:
   - Unnecessary comments (obvious, redundant, noisy)
   - Commented-out code (contains code syntax: `{`, `}`, `=`, `function`, `const`, `import`, `return`)
   - Console.log/debug statements (NOT console.error/warn in error handlers)
   - Copy-paste duplication (5+ similar consecutive lines across files)
   - Stale TODOs/FIXMEs (use `git blame` to check age)

**File sampling:** For large codebases (>200 files), sample strategically:
- All files with dead exports (from Phase 1)
- Files modified in last 30 days
- Random sample of remaining files (up to 50)

## Phase 4: Triage

Launch the **Triage Agent** (see `agents/triage-agent.md`).

1. Collect all findings from Phases 1-3
2. Apply safety rules (see `safety-rules.md`)
3. Score each finding with confidence percentage
4. Classify into tiers:
   - HIGH (>=90%): Safe to remove
   - MEDIUM (70-89%): Review recommended
   - LOW (<70%): Suppressed by default
   - FILTERED: Safety rule match, excluded entirely
5. Apply mode filter:
   - `scan`: Show all tiers (LOW collapsed)
   - `safe`: Show HIGH only
   - `aggressive`: Show HIGH + MEDIUM

## Phase 5: Report

Generate the final report per `output-format.md`.

1. Summary statistics (files scanned, issues found, categories)
2. Findings grouped by tier, then by category
3. Suppressed items in collapsible section
4. Safety-filtered count

## Early Exit Conditions

- **No index + no files**: Exit with "Nothing to analyze"
- **Zero findings**: Report "Clean codebase - no dead code detected"
- **`/nuke this` on entry point**: Warn that entry points are excluded from orphaned file detection, but still run generative analysis

## Error Handling

- If `matrix_find_dead_code` fails: fall back to manual export/caller enumeration
- If `matrix_find_circular_deps` fails: skip circular dep detection, note in report
- If file reading fails: skip that file, note in report
- Never crash the pipeline - always produce a report, even if partial
