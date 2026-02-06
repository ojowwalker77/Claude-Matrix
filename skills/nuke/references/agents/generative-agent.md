# Generative Agent

Detects code smells that require AI judgment. Lower base confidence than structural findings.

## Responsibilities

1. Unnecessary comments
2. Commented-out code
3. Console.log/debug leftovers
4. Copy-paste duplication
5. Stale TODO/FIXME

## File Sampling Strategy

For large codebases (>200 files), don't scan everything:

1. **Priority files** (always scan):
   - Files with dead exports from Structural Agent
   - Files modified in last 30 days (`git log --since="30 days ago" --name-only`)
2. **Random sample**: Up to 50 additional files
3. **For `/nuke this`**: Only the target file

## Detection Patterns

### 1. Unnecessary Comments

Read each file and flag comments that are:

**Redundant** (restating the code):
```typescript
// BAD - flag these:
i++; // increment i
const name = user.name; // get user name
constructor() { // constructor
return result; // return the result
```

**Empty/placeholder**:
```typescript
// BAD:
// TODO
//
/* */
```

**Obvious type annotations**:
```typescript
// BAD:
/** The name */
name: string;
```

**DO NOT flag** (see safety-rules.md):
- JSDoc with @param, @returns, @example
- License headers
- eslint/prettier/ts directives
- Comments containing "because", "why", "note:", "hack:", "workaround"
- Comments explaining business logic or non-obvious behavior

**Base confidence:** 70%

### 2. Commented-out Code

Detect comments that contain code syntax. A comment is likely commented-out code if it contains 2+ of:

```
{ } = => ( ) ;
function const let var class interface type enum
import export from require
return if else for while switch case
async await try catch throw
```

**Heuristic:** Use Grep to find multi-line comment blocks:
```
Grep({ pattern: "^\\s*//.*[{};=]", output_mode: "content" })
```

Then read surrounding context to confirm it's dead code, not explanatory.

**DO NOT flag:**
- Code examples in JSDoc
- ASCII art or diagrams
- URLs containing code-like syntax
- Comments that say "disabled because..." or "temporarily removed"

**Base confidence:** 70%

### 3. Console.log Leftovers

```
Grep({ pattern: "console\\.(log|debug|info|dir|table|trace|time|timeEnd)\\(", output_mode: "content" })
```

**Flag:** `console.log`, `console.debug`, `console.dir`, `console.table`, `console.trace`

**DO NOT flag:**
- `console.error` - usually intentional
- `console.warn` - usually intentional
- Inside files named `logger.*`, `log.*`, `debug.*`
- Inside `bin/`, `scripts/`, `cli.*`
- Conditional: `if (DEBUG)`, `if (process.env.NODE_ENV === 'development')`
- Inside catch blocks (may be intentional error logging)

**Base confidence:** 90%

### 4. Copy-paste Duplication

Look for near-identical code blocks (5+ consecutive similar lines) across different files.

**Strategy:**
1. For each file, extract function bodies
2. Compare against other files in the same directory
3. Flag blocks with >80% similarity (ignoring variable names and whitespace)

This is expensive - only run on priority files, not the full codebase.

**Base confidence:** 60% (high false positive risk)

### 5. Stale TODO/FIXME

```
Grep({ pattern: "(TODO|FIXME|HACK|XXX|TEMP|TEMPORARY)\\b", output_mode: "content" })
```

For each match, check age via git blame:
```bash
git blame -L <line>,<line> <file> --porcelain | grep "author-time"
```

**Classification:**
- >12 months old: **HIGH** confidence stale (85%)
- 6-12 months old: **MEDIUM** confidence stale (70%)
- <6 months old: **LOW** confidence (50%) - might be active work

**Boost confidence if:**
- No linked issue reference (`#123`, `JIRA-456`)
- File hasn't been modified in >3 months
- Author no longer in git log (left the project?)

**Lower confidence if:**
- Has issue reference
- File recently modified
- TODO is in an actively developed module

**Base confidence:** 60% (before age modifier)

## Output Format

Return findings as structured data:

```json
{
  "unnecessaryComments": [
    { "file": "...", "line": 42, "content": "// increment i", "confidence": 75 }
  ],
  "commentedOutCode": [
    { "file": "...", "startLine": 23, "endLine": 28, "preview": "// const old = ...", "confidence": 72 }
  ],
  "consoleLogs": [
    { "file": "...", "line": 67, "code": "console.log('debug:', data)", "confidence": 92 }
  ],
  "duplication": [
    { "fileA": "...", "fileB": "...", "linesA": "10-18", "linesB": "5-13", "similarity": 85, "confidence": 65 }
  ],
  "staleTodos": [
    { "file": "...", "line": 23, "content": "TODO: migrate to OAuth2", "age": "8 months", "confidence": 75 }
  ]
}
```
