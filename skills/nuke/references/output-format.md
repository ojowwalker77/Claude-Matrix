# Output Format

Template for the Nuke Report. Adapt based on actual findings.

## Full Report Template

```markdown
# Nuke Report

## Summary
Scanned: {fileCount} files | {symbolCount} symbols | {importCount} imports
Found: {totalIssues} issues across {categoryCount} categories
Mode: {mode} | Path: {pathFilter or "all"}

| Category | Count | Avg Confidence |
|----------|-------|----------------|
| Dead Exports | {n} | {pct}% |
| Orphaned Files | {n} | {pct}% |
| Circular Deps | {n} | 100% |
| Unused Packages | {n} | {pct}% |
| Unused Imports | {n} | {pct}% |
| Console.log Leftovers | {n} | {pct}% |
| Commented-out Code | {n} | {pct}% |
| Unnecessary Comments | {n} | {pct}% |
| Stale TODOs | {n} | {pct}% |
| Copy-paste Duplication | {n} | {pct}% |
| Overengineered Deps | {n} | {pct}% |

---

## HIGH Confidence (>90%) - Safe to Remove

### Dead Exports

| # | Symbol | File | Line | Kind | Confidence |
|---|--------|------|------|------|------------|
| 1 | `symbolName` | path/to/file.ts | 42 | function | 95% |

### Orphaned Files

| # | File | Exports | Symbols | Confidence |
|---|------|---------|---------|------------|
| 1 | path/to/unused.ts | 3 | 5 | 92% |

### Circular Dependencies

| # | Cycle | Length |
|---|-------|--------|
| 1 | a.ts -> b.ts -> c.ts -> a.ts | 3 |

### Console.log Leftovers

| # | File | Line | Code Preview |
|---|------|------|-------------|
| 1 | path/to/file.ts | 67 | `console.log('debug:', data)` |

### Commented-out Code

| # | File | Lines | Preview |
|---|------|-------|---------|
| 1 | path/to/file.ts | 23-28 | `// const old = ...` |

---

## MEDIUM Confidence (70-90%) - Review Before Removing

### Unused npm Packages

| # | Package | Type | Reason | Native Alternative |
|---|---------|------|--------|--------------------|
| 1 | `moment` | dependency | No imports found | `Intl.DateTimeFormat` |

### Stale TODOs

| # | File | Line | Age | Content |
|---|------|------|-----|---------|
| 1 | path/to/file.ts | 23 | 8mo | `// TODO: migrate to OAuth2` |

### Overengineered Dependencies

| # | Package | Usage | Alternative |
|---|---------|-------|-------------|
| 1 | `lodash` | 1 function (`_.get`) | Optional chaining `?.` |

---

## LOW Confidence (<70%) - Suppressed

<details>
<summary>{n} items suppressed (click to expand)</summary>

- `useTheme` in src/hooks/theme.ts - may be dynamically imported (45%)
- src/config/legacy.ts - may be entry point (55%)

</details>

---

## Safety-Filtered

{n} items matched safety rules and were excluded:
- {n} entry point files
- {n} framework convention files
- {n} dynamically imported modules
- {n} public API exports
```

## Compact Report (for `/nuke this`)

When analyzing a single file, use a simplified format:

```markdown
# Nuke Report: {filename}

## Findings

### Dead Exports ({n})
- `symbolName` (line {n}) - zero callers | {confidence}%

### Unused Imports ({n})
- `import { X }` from '{source}' (line {n}) - not referenced in file | {confidence}%

### Console.log ({n})
- Line {n}: `console.log(...)` | {confidence}%

### Comments ({n})
- Line {n}: Unnecessary comment: "{preview}" | {confidence}%
- Lines {n}-{m}: Commented-out code | {confidence}%

### Stale TODOs ({n})
- Line {n} ({age}): `// TODO: {content}` | {confidence}%

## Summary
{totalFindings} findings | {highCount} high confidence | {medCount} medium | {lowCount} low
```

## Rules

1. **Always show the summary table** - even if empty categories exist
2. **Omit empty categories** from the detailed sections
3. **File paths should be clickable** - use `file:line` format
4. **Code previews truncated** to 60 chars max
5. **Sort findings** within each category by confidence (highest first)
6. **Include the closing "Safety-Filtered" section** even if count is 0 (shows safety rules are working)
