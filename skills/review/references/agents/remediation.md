# Remediation Agent

Generates context-aware fixes, assesses regression risk, and suggests tests for uncovered code.

## Input
- Tier 1 & 2 findings from Triage Agent
- ImpactGraph from Impact Agent

## Output
```typescript
interface RemediationSuggestion {
  findingId: string;
  confidence: 'high' | 'medium' | 'low';
  fix: FixSuggestion;
  alternatives?: FixSuggestion[];
  regressionRisk: RegressionRisk;
  suggestedTests?: TestSuggestion[];
}

interface FixSuggestion {
  description: string;
  codeBefore: string;
  codeAfter: string;
  explanation: string;
}

interface RegressionRisk {
  level: 'low' | 'medium' | 'high';
  affectedFiles: string[];
  reason: string;
}

interface TestSuggestion {
  file: string;
  testCase: string;
  description: string;
}
```

---

## Process

### Step 1: Find Similar Patterns
```
For each finding:
  1. matrix_search_symbols for similar function/pattern names
  2. Read matched files to see how codebase handles this
  3. Extract patterns: error handling style, validation approach, etc.
```

### Step 2: Check Memory for Past Solutions
```
For each finding:
  1. matrix_recall({ query: finding.description })
  2. If solution found with high success rate:
     - Use as basis for fix
     - Adapt to current context
  3. If no solution:
     - Generate fresh based on codebase patterns
```

### Step 2.5: Check Library Best Practices (Context7)
```
If finding involves external library:
  1. Identify library from imports (e.g., "express", "prisma", "zod")
  2. resolve-library-id({ libraryName: "express", query: finding.description })
  3. query-docs({ libraryId: result.id, query: "security best practices for ${finding.type}" })
  4. Incorporate library-specific guidance into fix

Examples:
- SQL injection in Prisma → query-docs for parameterized queries
- Auth issue in Express → query-docs for middleware patterns
- Validation in Zod → query-docs for schema best practices
- File handling in Node → query-docs for path security

Skip if:
- No external library involved (pure JS/TS logic)
- Library not found in Context7
- Finding is style/opinion (Tier 3)
```

### Step 3: Generate Fix
```
Fix generation rules:
- Match codebase style (spacing, naming, patterns)
- Minimal change principle: fix only what's broken
- Preserve existing behavior for unaffected paths
- Include before/after code snippets
```

### Step 4: Assess Regression Risk
```
For each fix:
  1. Check blast radius: how many files import this?
  2. Check if fix changes function signature
  3. Check if fix changes return type/behavior
  4. Calculate risk level:
     - Low: Internal change, no signature change
     - Medium: Behavior change but backwards compatible
     - High: Signature change or breaking behavior change
```

### Step 5: Suggest Tests
```
If finding.file not covered by tests:
  1. Identify test file location (conventions: *.test.ts, __tests__/)
  2. Generate test case for the specific issue
  3. Include edge case tests if applicable
```

---

## Fix Generation Strategies

### Security Fixes

#### SQL Injection
```typescript
// Before (vulnerable)
const users = await db.query(`SELECT * FROM users WHERE id = ${userId}`);

// After (parameterized)
const users = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

// Or with ORM pattern (if codebase uses ORM)
const users = await User.findById(userId);
```

#### Command Injection
```typescript
// Before (vulnerable)
exec(`ls ${userPath}`);

// After (escaped/validated)
import { escapeShellArg } from './utils/shell';
exec(`ls ${escapeShellArg(userPath)}`);

// Or (better - avoid shell)
import { spawn } from 'child_process';
spawn('ls', [userPath]);
```

#### Path Traversal
```typescript
// Before (vulnerable)
const content = fs.readFileSync(path.join(baseDir, userPath));

// After (validated)
const resolvedBase = path.resolve(baseDir);
const fullPath = path.resolve(baseDir, userPath);
if (!fullPath.startsWith(resolvedBase + path.sep)) {
  throw new Error('Invalid path: directory traversal detected');
}
const content = fs.readFileSync(fullPath);
```

### Runtime Fixes

#### Uncaught Promise
```typescript
// Before
async function fetchData() {
  const data = await api.get('/data');
  return data;
}

// After
async function fetchData() {
  try {
    const data = await api.get('/data');
    return data;
  } catch (error) {
    logger.error('Failed to fetch data', error);
    throw error; // or return default/null based on codebase pattern
  }
}
```

#### Null Access
```typescript
// Before
const name = user.profile.name;

// After (optional chaining)
const name = user?.profile?.name;

// Or (with default)
const name = user?.profile?.name ?? 'Unknown';
```

### Breaking Change Fixes

#### Removed Export - Add Back with Deprecation
```typescript
// If export was removed but still needed:
/** @deprecated Use newFunction instead. Will be removed in v2.0 */
export const oldFunction = newFunction;
```

#### Changed Signature - Overload for Compatibility
```typescript
// If signature changed from (a, b) to (options):
export function myFunc(options: Options): Result;
/** @deprecated Use options object instead */
export function myFunc(a: string, b: number): Result;
export function myFunc(aOrOptions: string | Options, b?: number): Result {
  // Implementation handling both forms
}
```

---

## Regression Risk Assessment

### Low Risk Indicators
- Change is internal to function (no signature change)
- Fix adds validation that rejects previously-invalid input
- Change is additive (new error handling, logging)
- Affected callers are all test files

### Medium Risk Indicators
- Behavior change but API contract preserved
- New error conditions that callers should handle
- Performance characteristics changed
- 1-5 non-test callers affected

### High Risk Indicators
- Function signature changed (parameters, return type)
- Previously-working input now rejected
- Breaking change to public API
- >5 non-test callers affected
- Service boundary affected

---

## Test Suggestion Examples

### For Security Issue
```typescript
// Suggested test for SQL injection fix
describe('getUserById', () => {
  it('should reject SQL injection attempts', async () => {
    const maliciousId = "1'; DROP TABLE users; --";
    await expect(getUserById(maliciousId)).rejects.toThrow();
  });

  it('should handle valid numeric ids', async () => {
    const user = await getUserById('123');
    expect(user.id).toBe(123);
  });
});
```

### For Null Access Fix
```typescript
// Suggested test for null safety
describe('getProfileName', () => {
  it('should return name when profile exists', () => {
    const user = { profile: { name: 'John' } };
    expect(getProfileName(user)).toBe('John');
  });

  it('should handle missing profile gracefully', () => {
    const user = {};
    expect(getProfileName(user)).toBeUndefined();
  });

  it('should handle null user', () => {
    expect(getProfileName(null)).toBeUndefined();
  });
});
```

---

## Output Confidence Levels

### High Confidence Fix
- Exact pattern found in codebase
- Past solution with success rate > 80%
- Standard security fix (well-known patterns)
- Regression risk: low

### Medium Confidence Fix
- Similar pattern found, adapted
- Past solution with success rate 50-80%
- Fix requires some judgment
- Regression risk: medium

### Low Confidence Fix
- No similar pattern in codebase
- No past solution available
- Multiple valid approaches
- Regression risk: high or unknown
- **Output as guidance, not code**

---

## Learning Integration

After fix is applied (in future session):
```
If fix worked:
  matrix_reward(solutionId, 'success')

If fix needed modification:
  matrix_reward(solutionId, 'partial', notes)
  matrix_store(improvedSolution)

If fix caused issues:
  matrix_reward(solutionId, 'failure')
  matrix_failure(errorDetails)
```
