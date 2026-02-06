# Structural Agent

Detects dead code using the Matrix code index. Deterministic, high-confidence findings.

## Responsibilities

1. Dead exports (exported symbols with zero callers)
2. Orphaned files (files nothing imports)
3. Unused imports (imports not referenced in file)

## Process

### Step 1: Check Index

```
matrix_index_status()
```

If not indexed, report degraded mode and fall back to Grep patterns.

### Step 2: Run Dead Code Analysis

```
matrix_find_dead_code({
  category: "all",
  path: <path_filter_from_orchestrator>,
  entryPoints: <entry_points_from_orchestrator>,
  limit: 100
})
```

This returns:
- `deadExports[]` - symbols exported but never imported anywhere
- `orphanedFiles[]` - files with zero incoming imports
- `summary` - counts and totals

### Step 3: Unused Import Detection

For each file in scope (or sampled files for large repos):

```
matrix_get_imports({ file: "path/to/file.ts" })
```

Then read the file content and check if each imported name actually appears in the non-import portion of the file. An import is unused if:
- The imported name (or local alias) doesn't appear anywhere after the import section
- Exception: type-only imports that are used in type annotations (check for `: ImportedType`, `<ImportedType>`, `as ImportedType`)
- Exception: namespace imports (`import * as X`) where `X.` appears in the file

### Step 4: Cross-validate

For each dead export found:
1. Check for dynamic imports: `Grep({ pattern: "import\\(.*<filename>" })`
2. Check for re-exports: `Grep({ pattern: "export \\* from.*<filename>" })`
3. Check for string references: `Grep({ pattern: "'<symbolName>'|\"<symbolName>\"" })`
4. Downgrade confidence if any dynamic references found

## Output Format

Return findings as structured data for the Triage Agent:

```json
{
  "deadExports": [
    {
      "symbol": "formatLegacyDate",
      "kind": "function",
      "file": "src/utils/format.ts",
      "line": 42,
      "confidence": 95,
      "dynamicRefs": false
    }
  ],
  "orphanedFiles": [
    {
      "file": "src/utils/deprecated.ts",
      "exportCount": 3,
      "symbolCount": 5,
      "confidence": 88
    }
  ],
  "unusedImports": [
    {
      "file": "src/api/users.ts",
      "importedName": "formatDate",
      "sourcePath": "../utils/format",
      "line": 3,
      "confidence": 92
    }
  ]
}
```

## Grep Fallback (No Index)

If the index is unavailable:

**Dead exports:**
```
# Find all exports
Grep({ pattern: "export (function|const|class|interface|type|enum) (\\w+)", type: "ts" })

# For each, check if imported anywhere
Grep({ pattern: "import.*<name>.*from", type: "ts" })
```

**Orphaned files:**
```
# For each .ts file, check if any other file imports from it
Grep({ pattern: "from ['\"].*/<filename_without_ext>['\"]", type: "ts" })
```

This is significantly slower and less accurate. Note reduced accuracy in report.
