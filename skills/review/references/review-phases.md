# Code Review: Orchestrator + 5-Agent Pipeline

## Architecture Overview

```
ORCHESTRATOR (parses target, routes, aggregates)
     │
     ├── DETECTION AGENT → security, runtime, breaking, logic flaws
     ├── IMPACT AGENT → blast radius, transitive graph, test coverage
     ├── TRIAGE AGENT → tier assignment, confidence calibration, noise filter
     ├── REMEDIATION AGENT → context-aware fixes, regression checks
     └── VERIFICATION AGENT → build, test, lint validation
```

**Execution order:** Sequential (Detection → Impact → Triage → Remediation → Verification)
**Early exit:** If Detection finds nothing critical, skip deep Impact/Triage analysis

---

## Orchestrator

### 1. Pre-flight Checks

```
BEFORE any analysis, verify tool availability:

1. Check Index Status:
   result = matrix_index_status()

   If result.indexed == false OR result.stale == true:
     indexAvailable = false
     Warn: "Code index unavailable/stale. Using Grep fallback (slower but complete)."
   Else:
     indexAvailable = true

2. Set Tool Strategy:
   If indexAvailable:
     findCallers = matrix_find_callers
     findDefinition = matrix_find_definition
     listExports = matrix_list_exports
     searchSymbols = matrix_search_symbols
   Else:
     findCallers = grep_fallback_callers    # Grep for import statements
     findDefinition = grep_fallback_def     # Grep for function/class def
     listExports = grep_fallback_exports    # Grep for export statements
     searchSymbols = grep_fallback_search   # Grep with pattern
```

### 2. Parse Target

```
Input: <target> [mode]

Targets:
- File path: "src/utils/auth.ts" → Read file directly
- "staged": git diff --cached --name-only → list changed files
- "uncommitted": git diff --name-only → list all uncommitted changes
- PR number: gh pr diff <number> → get PR changes

For PR targets, check merge status first:
  gh pr view <number> --json mergeable,mergeStateStatus
  If mergeable = "CONFLICTING":
    Warn: "PR has merge conflicts. Resolve before review for accurate analysis."
    Continue with review but note affected files may have conflict markers.
```

### 3. Dispatch Agents

**Default mode:** All 4 agents
**Lazy mode:** Detection only (Tier 1 issues)

### 4. Aggregate Results

Combine agent outputs into final review format (see Output Format below)

---

## Agent References

Each agent has detailed documentation:

- **`agents/detection.md`** - Vulnerability patterns, runtime checks, breaking change detection
- **`agents/impact.md`** - Transitive blast radius algorithm, service boundary detection
- **`agents/triage.md`** - Tier definitions, confidence calibration, signal ratio calculation
- **`agents/remediation.md`** - Fix generation, regression risk assessment
- **`agents/verification.md`** - Project command detection, build/test/lint execution

---

## Execution Flow

### Step 1: Detection Agent
```
Input: changed files/diff
Output: DetectionFinding[]

For each file:
1. Scan for SECURITY patterns (injection, secrets, auth)
2. Scan for RUNTIME issues (uncaught promises, null access)
3. Check for BREAKING changes (removed exports, changed signatures)
4. Identify LOGIC flaws (dead code, unreachable branches)

Early exit check: if no critical/high findings, reduce Impact depth
```

### Step 2: Impact Agent
```
Input: changed files, Detection findings
Output: ImpactGraph

1. matrix_list_exports(changed_files) → changed symbols
2. matrix_find_callers(symbols) → direct callers (1st degree)
3. Recurse for 2nd/3rd degree if critical findings exist
4. Identify test files (*.test.ts, *.spec.ts)
5. Detect service boundaries (routes/, api/, handlers/)
6. Calculate risk score
```

### Step 3: Triage Agent
```
Input: DetectionFinding[], ImpactGraph
Output: TriagedFinding[] with tier assignments

For each finding:
1. Assign initial tier based on type/severity
2. Apply confidence calibration
3. Calculate signal ratio
4. Suppress Tier 3 (noise)
```

### Step 4: Remediation Agent
```
Input: Tier 1 & 2 findings, ImpactGraph
Output: RemediationSuggestion[]

For each finding:
1. matrix_search_symbols for similar patterns
2. matrix_recall for past solutions
3. Generate fix matching codebase style
4. Assess regression risk against blast radius
5. Suggest tests if coverage gap
```

### Step 5: Verification Agent
```
Input: Changed files, project root
Output: VerificationResult

1. Detect project type (package.json, Cargo.toml, go.mod, etc.)
2. Extract available commands (build, test, lint, typecheck)
3. Execute commands in order: build → typecheck → test → lint
4. Continue on failure, report each result
5. Summarize: X/Y passed

Skip if:
- No project config found
- Lazy mode active
- Docs-only changes
```

---

## Output Format

```markdown
# Matrix Review

## Risk Assessment
Impact Score: 7/10 | Signal Ratio: 87% (23 shown, 3 suppressed)
Blast Radius: 18 files | API Boundaries: 2 routes | Test Coverage: 75%

## Tier 1: Critical (MUST address)

### 1. [SECURITY] SQL Injection
**File:** src/api/users.ts:42 | **Confidence:** 94%

**Issue:**
User input passed directly to query without sanitization.

**Blast Radius:** 8 files import this module, 2 API routes affected

**Suggested Fix:**
```typescript
// Before
const users = await db.query(`SELECT * FROM users WHERE id = ${userId}`);

// After
const users = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
```

**Regression Risk:** Low - parameterized queries are backwards compatible

---

## Tier 2: Important (SHOULD address)

### 3. [PERF] N+1 Query Pattern
**File:** src/services/orders.ts:67 | **Confidence:** 82%

**Issue:**
Loop executes individual queries instead of batch fetch.

**Suggested Fix:** Use `WHERE id IN (...)` with collected IDs

---

## Suppressed (Tier 3) - 3 items
<details>
<summary>Click to expand low-confidence/style issues</summary>

- [STYLE] Inconsistent spacing in src/utils/format.ts:12 (confidence: 45%)
- [STYLE] Prefer const over let in src/api/auth.ts:89 (confidence: 52%)
- [OPINION] Consider destructuring in src/handlers/user.ts:34 (confidence: 38%)

</details>

---

## File Scores

| File | Score | Critical | Important | Coverage |
|------|-------|----------|-----------|----------|
| src/api/users.ts | 2/5 | 1 | 0 | 60% |
| src/services/orders.ts | 3/5 | 0 | 1 | 85% |
| src/utils/auth.ts | 4/5 | 0 | 0 | 90% |

---

## Confidence Score: 3/5

Important issues found that should be addressed before merge.
SQL injection vulnerability in users.ts requires immediate fix.

---

## Verification

| Command | Status | Duration |
|---------|--------|----------|
| build | PASS | 2.3s |
| typecheck | PASS | 1.1s |
| test | FAIL | 8.2s |
| lint | PASS | 0.5s |

### Failed: test
\`\`\`
npm run test

FAIL src/utils/auth.test.ts
  ● AuthService › should validate token
    Expected: true
    Received: false
\`\`\`

**Summary:** 3/4 passed. Fix test failures before merge.
```

---

## Scoring Guidelines

### Overall Confidence Score
- **5/5:** No issues, ready to merge
- **4/5:** Minor suggestions only, approve with optional changes
- **3/5:** Important issues that should be addressed
- **2/5:** Critical issues requiring attention before merge
- **1/5:** Critical bugs/vulnerabilities that will cause harm

### Per-File Score
- **5/5:** No issues, clean implementation
- **4/5:** Minor style/documentation suggestions
- **3/5:** Some improvements recommended
- **2/5:** Has bugs or significant issues
- **1/5:** Critical bugs that will cause incorrect behavior

---

## Learning Loop

After review completion:

- **If solution helped:** Use `matrix_reward` with outcome
- **If novel pattern found:** Use `matrix_store` for future reviews
- **If false positive:** Note for confidence calibration
- **If fix caused issues:** Use `matrix_failure` to record for prevention

---

## Grep Fallback Patterns

When code index is unavailable, use these Grep patterns:

### grep_fallback_callers(symbol)
```bash
# Find files importing the symbol
Grep pattern: "import.*{[^}]*\b${symbol}\b[^}]*}.*from|import\s+${symbol}\s+from|require\(.*\).*${symbol}"
```

### grep_fallback_def(symbol)
```bash
# Find function/class/type definitions
Grep pattern: "(function|const|let|var|class|interface|type|enum)\s+${symbol}\b|export\s+(default\s+)?(function|class)\s+${symbol}"
```

### grep_fallback_exports(file)
```bash
# Find all exports in a file
Grep pattern: "export\s+(default\s+)?(function|class|const|let|var|interface|type|enum)\s+(\w+)|export\s+\{[^}]+\}"
```

### grep_fallback_search(query)
```bash
# General symbol search
Grep pattern: "\b${query}\b"
```

**Note:** Grep fallback is slower and may miss dynamic imports/re-exports. Prefer indexed queries when available.
