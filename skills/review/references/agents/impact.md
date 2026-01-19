# Impact Agent

Calculates true blast radius with transitive dependency graph, test coverage, and service boundaries.

## Input
- Changed files
- Detection findings (for depth decision)

## Output
```typescript
interface ImpactGraph {
  directChanges: FileChange[];
  firstDegree: Caller[];      // Direct importers
  secondDegree: Caller[];     // Importers of importers
  thirdDegree?: Caller[];     // Optional, only if critical findings
  testCoverage: TestCoverage;
  serviceBoundaries: ServiceBoundary[];
  riskScore: number;          // 1-10
}

interface FileChange {
  file: string;
  exports: string[];          // Changed/added/removed exports
  changeType: 'modified' | 'added' | 'deleted';
}

interface Caller {
  file: string;
  symbols: string[];          // Which symbols it imports
  degree: 1 | 2 | 3;
  isTest: boolean;
}

interface TestCoverage {
  percentage: number;
  testFiles: string[];
  uncoveredSymbols: string[];
}

interface ServiceBoundary {
  type: 'route' | 'api' | 'handler' | 'export';
  file: string;
  endpoint?: string;
}
```

---

## Algorithm

### Step 1: Extract Changed Symbols
```
For each changed file:
  exports = matrix_list_exports(file)
  Track: added, modified, removed exports
```

### Step 2: Build Transitive Graph
```
depth = detection.hasCritical ? 3 : 2

For each exported symbol:
  callers_1 = matrix_find_callers(symbol)
  firstDegree.push(...callers_1)

  if depth >= 2:
    For each caller in callers_1:
      if not isTestFile(caller):
        caller_exports = matrix_list_exports(caller.file)
        For each export:
          callers_2 = matrix_find_callers(export)
          secondDegree.push(...callers_2)

  if depth >= 3:
    // Similar recursion for 3rd degree
    // Cap at 50 files to avoid explosion
```

### Step 3: Identify Test Files
```
Test file patterns:
- *.test.ts, *.spec.ts
- *.test.js, *.spec.js
- __tests__/*.ts
- test/*.ts

For each caller:
  caller.isTest = matchesTestPattern(caller.file)

testCoverage.testFiles = callers.filter(c => c.isTest)

// Calculate coverage as % of SYMBOLS with at least one test caller
coveredSymbols = symbols.filter(s => hasTestCaller(s))
testCoverage.percentage = coveredSymbols.length / totalSymbols.length * 100
testCoverage.uncoveredSymbols = symbols.filter(s => !hasTestCaller(s))
```

### Step 4: Detect Service Boundaries
```
Heuristics:

Route files:
- routes/*.ts, router/*.ts
- Contains @Get, @Post, @Put, @Delete decorators
- Contains app.get(), router.get(), etc.

API files:
- api/*.ts, endpoints/*.ts
- handlers/*.ts, controllers/*.ts
- Contains export handler/controller functions

For each file in blast radius:
  if matchesBoundaryPattern(file):
    serviceBoundaries.push({ type, file, endpoint })
```

### Step 5: Calculate Risk Score
```
Base score from degree counts:
- Each direct change: 10 points
- Each 1st degree: 5 points
- Each 2nd degree: 2 points
- Each 3rd degree: 1 point

Modifiers:
- Uncovered code: +30% of base
- API boundary affected: +50% of base
- Test file only: -20% (less risky)

Normalize to 1-10 scale:
- 1-3: Low (< 20 points)
- 4-6: Medium (20-50 points)
- 7-9: High (50-100 points)
- 10: Critical (> 100 points)
```

---

## Matrix Tool Usage

### matrix_list_exports
```
Purpose: Get all exported symbols from a file
Input: { path: "src/utils/auth.ts" }
Output: [{ name: "validateToken", kind: "function" }, ...]
```

### matrix_find_callers
```
Purpose: Find all files that import and use a symbol
Input: { symbol: "validateToken", file: "src/utils/auth.ts" }
Output: [{ file: "src/middleware/auth.ts", ... }, ...]
```

### matrix_get_imports
```
Purpose: Get all imports in a file (for understanding dependencies)
Input: { file: "src/api/users.ts" }
Output: [{ source: "../utils/auth", symbols: ["validateToken"] }, ...]
```

---

## Output Example

```
Blast Radius Analysis
=====================

Direct Changes: 2 files
├── src/utils/auth.ts (modified)
│   └── Exports: validateToken, refreshToken
└── src/utils/session.ts (modified)
    └── Exports: createSession, destroySession

First Degree (8 files):
├── src/middleware/authenticate.ts → validateToken
├── src/api/login.ts → validateToken, createSession
├── src/api/logout.ts → destroySession
├── src/handlers/user.ts → refreshToken
└── ... 4 more

Second Degree (12 files):
├── src/routes/api.ts → imports authenticate middleware
├── src/app.ts → imports routes
└── ... 10 more

Test Coverage: 65%
├── Covered: validateToken, createSession
├── Uncovered: refreshToken, destroySession
└── Test files: auth.test.ts, session.test.ts

Service Boundaries: 3
├── [ROUTE] src/routes/api.ts → /api/*
├── [HANDLER] src/handlers/user.ts → userHandler
└── [API] src/api/login.ts → POST /login

Risk Score: 7/10 (High)
- 2 direct + 8 first + 12 second = 48 points
- Uncovered code: +14 points
- API boundaries: +24 points
- Total: 86 points → Score 7
```

---

## Performance Considerations

- **Cap recursion:** Max 3 degrees, max 50 files per degree
- **Early termination:** If > 100 callers at degree 1, likely a util file - note and stop
- **Parallel queries:** Batch matrix_find_callers calls where possible
- **Cache exports:** Don't re-query same file's exports
