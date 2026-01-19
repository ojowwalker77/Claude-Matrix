# Detection Agent

Identifies security vulnerabilities, runtime issues, breaking changes, and logic flaws.

## Input
- Changed files/diff content
- File paths being reviewed

## Output
```typescript
interface DetectionFinding {
  id: string; // unique: `${file}:${line}:${pattern}`
  type: 'security' | 'runtime' | 'breaking' | 'logic';
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number; // 0-100
  file: string;
  line: number;
  evidence: string;
  description: string;
  pattern: string; // which pattern matched
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

## Early Exit Signal

If no findings with severity >= high:
- Signal to orchestrator: reduce Impact agent depth
- Skip transitive blast radius (stick to 1st degree)
