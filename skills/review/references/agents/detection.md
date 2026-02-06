# Detection Agent

Identifies security vulnerabilities, runtime issues, breaking changes, logic flaws, and hygiene issues (nuke scan).

## Input
- Changed files/diff content
- File paths being reviewed

## Output
```typescript
interface DetectionFinding {
  id: string; // unique: `${file}:${line}:${pattern}`
  type: 'security' | 'runtime' | 'breaking' | 'logic' | 'hygiene';
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number; // 0-100
  file: string;
  line: number;
  evidence: string;
  description: string;
  pattern: string; // which pattern matched
  introduced?: boolean; // true if introduced by this change, false if pre-existing
}
```

---

## Detection Patterns

### SECURITY Patterns

#### SQL Injection
```
Patterns:
- String interpolation in query: `query(\`...${var}...\`)`
- String concat in query: query("..." + var + "...")
- .raw() with user input
- Template literals in SQL without parameterization

Severity: critical
Confidence: 90% if user input traceable, 70% otherwise
```

#### Command Injection
```
Patterns:
- exec(), execSync() with string interpolation
- spawn() with shell: true and user input
- child_process with unsanitized args
- eval() with external data

Severity: critical
Confidence: 95% if direct user input, 75% if indirect
```

#### Path Traversal
```
Patterns:
- fs operations with user-controlled path
- path.join() without validation
- Missing path.normalize() before fs access
- No check for ".." in path segments

Severity: high
Confidence: 85%
```

#### Hardcoded Secrets
```
Patterns:
- API_KEY = "..." (non-placeholder)
- password = "..." (literal string)
- secret = "..." (not from env)
- Bearer/Basic auth with literal token
- Private key material inline

Severity: high
Confidence: 95% for obvious patterns, 60% for ambiguous
```

#### Missing Auth
```
Patterns:
- Route handler without auth middleware
- API endpoint missing authorization check
- Direct database access without permission check
- Exported function without caller validation

Severity: high
Confidence: 70% (needs context verification)
```

---

### RUNTIME Patterns

#### Uncaught Promises
```
Patterns:
- async function without try/catch at top level
- Promise without .catch()
- await without surrounding try/catch
- Missing error handler in Promise.all/race

Severity: high
Confidence: 80%
```

#### Null/Undefined Access
```
Patterns:
- obj.prop without null check (where obj might be undefined)
- array[index] without bounds check
- Optional chain missing: obj.nested.deep (should be obj?.nested?.deep)
- Destructuring without default values

Severity: medium
Confidence: 75%
```

#### Array Bounds
```
Patterns:
- array[i] in loop without length check
- array.pop()/shift() without empty check
- Direct index access: array[0] without length verification

Severity: medium
Confidence: 70%
```

#### Resource Leaks
```
Patterns:
- File handle opened without close in finally
- Database connection without release
- Event listener added without cleanup
- setInterval without clear
- Stream not properly ended

Severity: medium
Confidence: 65%
```

---

### BREAKING Patterns

#### Removed Exports
```
Detection:
1. Use matrix_list_exports on previous version (if available)
2. Compare with current exports
3. Flag any removed public exports

Severity: high
Confidence: 95%
```

#### Changed Signatures
```
Patterns:
- Function parameter count changed
- Required parameter added
- Return type changed (if typed)
- Parameter type narrowed

Severity: high
Confidence: 90% for typed code, 70% for untyped
```

#### Modified Return Types
```
Patterns:
- Async function became sync (or vice versa)
- Return type shape changed
- Nullable return became non-nullable (or vice versa)
- Array return became single item

Severity: high
Confidence: 85%
```

---

### LOGIC Patterns

#### Dead Code
```
Patterns:
- Return statement before code
- Unreachable after throw
- Condition always true/false
- Unused variable after assignment

Severity: low
Confidence: 90%
```

#### Unreachable Branches
```
Patterns:
- else after return in all if branches
- switch case after default with no break
- catch after catch-all

Severity: low
Confidence: 85%
```

#### Off-by-One
```
Patterns:
- < vs <= in loop bounds
- array.length vs array.length - 1
- Fence-post errors in iteration

Severity: medium
Confidence: 60% (high false positive rate)
```

---

## Execution Steps

1. **Read changed files** using Read tool
2. **For each file:**
   - Scan line-by-line for pattern matches
   - Track variable flow for taint analysis (see below)
   - Check function signatures against exports
3. **For breaking changes:**
   - Use `matrix_list_exports` to get current exports
   - Compare with git diff to identify removed/changed
4. **Aggregate findings** with deduplication
5. **Sort by severity** (critical → low)

---

## Taint Analysis with matrix_find_definition

For security patterns (injection, traversal), trace variable origins:

```
1. Identify suspicious variable usage:
   db.query(`SELECT * FROM users WHERE id = ${userId}`)
                                            ^^^^^^^^
2. Trace origin with matrix_find_definition:
   result = matrix_find_definition({ symbol: "userId" })

3. Check if origin is user-controlled:
   - Function parameter → HIGH risk (direct user input)
   - Request body/query/params → HIGH risk
   - Environment variable → LOW risk
   - Hardcoded constant → NO risk
   - Database query result → MEDIUM risk (indirect)

4. Adjust confidence based on origin:
   - User-controlled: confidence = 95%
   - Indirect source: confidence = 75%
   - Unknown origin: confidence = 60%
```

### Example: Command Injection Trace

```typescript
// File: src/api/files.ts
function listFiles(userPath: string) {  // ← parameter = user input
  exec(`ls ${userPath}`);               // ← flagged
}

// matrix_find_definition({ symbol: "userPath" }) reveals:
// - Kind: parameter
// - Origin: function argument
// - Confidence boost: 95% (direct user input)
```

### Example: Safe Variable

```typescript
// File: src/utils/config.ts
const BASE_DIR = process.env.BASE_DIR || '/app';  // ← env var

// matrix_find_definition({ symbol: "BASE_DIR" }) reveals:
// - Kind: const
// - Origin: environment variable
// - Confidence reduction: 40% (likely safe)
```

---

### HYGIENE Patterns (Nuke Scan)

Run a full nuke-style hygiene scan on the changed files and their dependency graph. Distinguish between issues **introduced** by this change (check git diff) vs **pre-existing** in touched files.

#### Dead Exports
```
Use matrix_find_dead_code on changed files:
  matrix_find_dead_code({ path: <changed_file_directory> })

For each dead export in a changed file:
- If the export was REMOVED by this change → not a finding (intentional deletion)
- If the export EXISTS but has zero callers → finding

Severity: medium
Confidence: 85% base, +10% if introduced, -10% if pre-existing
```

#### Orphaned Files
```
Check if any changed files created orphaned modules:
  matrix_find_dead_code({ category: "orphaned_files", path: <scope> })

Cross-reference with git diff --name-only to see if new files were added
that nothing imports yet.

Severity: medium
Confidence: 80% base
```

#### Circular Dependencies
```
  matrix_find_circular_deps({ path: <scope> })

Flag any cycles that involve changed files.
Cycles involving only unchanged files → mark as [pre-existing], lower priority.

Severity: medium
Confidence: 100% (factual)
```

#### Unused Imports
```
For each changed file:
  matrix_get_imports({ file: <path> })

Then Read the file and verify each imported name appears in the
non-import portion. An import is unused if:
- The name (or local alias) doesn't appear after the import section
- Exception: type-only imports used in annotations (: Type, <Type>)
- Exception: namespace imports where X. appears

Check git diff: was this unused import INTRODUCED or PRE-EXISTING?

Severity: medium
Confidence: 90% if introduced, 75% if pre-existing
```

#### Unused npm Packages
```
Read package.json, cross-reference each dependency with:
  Grep({ pattern: "from ['\"]<package>", glob: "*.{ts,tsx,js,jsx}" })

Also check config files and npm scripts for non-import usage.
Only flag if ZERO references found anywhere.

Severity: low
Confidence: 75%
```

#### Console.log Leftovers
```
  Grep({ pattern: "console\\.(log|debug|dir|table|trace)\\(", path: <changed_files> })

DO NOT flag: console.error, console.warn, logger files, CLI scripts,
conditional debug blocks.

Check git diff: was this console.log INTRODUCED in this change?

Severity: medium if introduced, low if pre-existing
Confidence: 92% if introduced (almost certainly debug leftover), 70% if pre-existing
```

#### Commented-out Code
```
Read changed files, identify comment blocks containing 2+ code tokens:
  { } = => ; function const let var class interface import export return

DO NOT flag: JSDoc examples, ASCII art, URLs, "disabled because..." comments.
Check git diff for introduced vs pre-existing.

Severity: low
Confidence: 72% if introduced, 60% if pre-existing
```

#### Unnecessary Comments
```
Read changed files, flag comments that restate the code:
  i++; // increment i
  const name = user.name; // get user name

DO NOT flag: JSDoc, license headers, eslint/ts directives, "why"/"because" explanations.

Severity: low
Confidence: 70%
```

#### Overengineered Dependencies
```
For packages imported in changed files, check if usage is minimal:
  Grep({ pattern: "from ['\"]<package>", output_mode: "count" })

If only 1-2 usage sites and a native alternative exists (see nuke
dependency-agent.md for the known replaceable list), flag it.

Use Context7 to verify native alternative availability.

Severity: low
Confidence: 70%
```

#### Copy-paste Duplication
```
Compare changed file function bodies against other files in the same
directory. Flag blocks with >80% similarity over 5+ consecutive lines.
Only run on changed files (expensive).

Severity: low
Confidence: 60%
```

#### Stale TODOs
```
  Grep({ pattern: "(TODO|FIXME|HACK|XXX)\\b", path: <changed_files> })

Check age via: git blame -L <line>,<line> <file> --porcelain
- >12 months: severity medium, confidence 80%
- 6-12 months: severity low, confidence 65%
- <6 months: skip (likely active work)

Check git diff: was this TODO INTRODUCED in this change?
If introduced: flag as "new TODO" (not stale), severity low, confidence 60%.

Severity: low-medium
Confidence: varies by age
```

---

### Hygiene Execution Steps

After completing SECURITY, RUNTIME, BREAKING, and LOGIC scans:

1. **Run structural analysis** on changed file scope:
   ```
   matrix_find_dead_code({ path: <common_directory_of_changed_files> })
   matrix_find_circular_deps({ path: <common_directory_of_changed_files> })
   ```

2. **Run per-file hygiene** for each changed file:
   - Check unused imports (matrix_get_imports + file read)
   - Grep for console.log, TODOs
   - AI-scan for commented-out code, unnecessary comments

3. **Determine introduced vs pre-existing** for each finding:
   - Parse `git diff` for changed lines
   - If finding is on a line that was ADDED (starts with `+`): `introduced = true`
   - If finding is on an unchanged line: `introduced = false`, mark `[pre-existing]`

4. **Package-level checks** (once, not per-file):
   - Read package.json, check for unused/overengineered deps

5. **Aggregate hygiene findings** with the other detection categories

---

## Early Exit Signal

If no findings with severity >= high:
- Signal to orchestrator: reduce Impact agent depth
- Skip transitive blast radius (stick to 1st degree)
