---
description: Conduct a multi-phase code review with blast radius analysis
---

# Matrix Code Review

Perform a comprehensive, context-aware code review using Matrix's review pipeline with full index integration.

> **Tip:** For best results, run `/matrix:review` in a **fresh session**. A new session has no prior context about the code, which provides an unbiased perspective—similar to how a human reviewer would approach the code for the first time.

## Usage

Parse arguments: `$ARGUMENTS`

**Expected format:** `<target> [mode]`

- **target**: File path, PR number, or "staged" for staged changes
- **mode** (optional): `default` | `lazy` (default: from config or `default`)

## Modes

### Default Mode (Comprehensive)
Full 5-phase review pipeline with maximum index utilization:
- Blast radius analysis via `matrix_find_callers`
- Symbol lookup via `matrix_find_definition` and `matrix_search_symbols`
- Memory recall via `matrix_recall` for relevant past solutions
- Deep security and edge case analysis
- ~10+ comments, thorough coverage

### Lazy Mode (Quick)
Single-pass review for fast feedback:
- Direct code inspection only
- No index queries (faster)
- Main issues only
- ~2-3 comments

## 5-Phase Review Pipeline

### Phase 1: Context Mapping (Blast Radius)

Calculate the impact scope of changes:

1. **Identify changed files/functions**
   - For file path: Use `Read` tool to examine the file
   - For "staged": Use `git diff --cached --name-only`
   - For PR: Use `gh pr diff <number>`

2. **Find all callers using `matrix_find_callers`**
   - For each exported function/class in changed files
   - Build dependency graph of affected code

3. **Calculate impact score**
   - Direct changes: Files modified
   - First-degree impact: Files that import changed modules
   - Second-degree impact: Files that import first-degree files

Output format:
```
Blast Radius Analysis
=====================
Direct changes: 3 files
  - src/utils/auth.ts (modified)
  - src/utils/session.ts (modified)
  - src/api/login.ts (modified)

First-degree impact: 8 files
  - src/middleware/authenticate.ts (imports auth)
  - src/handlers/user.ts (imports session)
  ...

Impact Score: 7/10 (medium-high)
```

### Phase 2: Intent Inference

Analyze what the change is trying to accomplish:

1. **Gather context**
   - Commit messages (if available)
   - PR description (if PR number provided)
   - Code comments and docstrings

2. **Classify change type**
   - bugfix: Fixing incorrect behavior
   - feature: Adding new functionality
   - refactor: Restructuring without behavior change
   - performance: Optimization
   - security: Security improvement
   - cleanup: Code quality improvement

3. **Summarize intent**
   - What problem is being solved?
   - What approach is being taken?

### Phase 3: Socratic Questioning

Generate probing questions about the changes:

1. **Edge cases**
   - What happens with null/undefined inputs?
   - What about empty collections?
   - Boundary conditions?

2. **Error handling**
   - Are errors properly caught and handled?
   - Are error messages helpful?
   - Is error state properly cleaned up?

3. **Testing coverage**
   - Are the changes covered by tests?
   - Are edge cases tested?
   - Should new tests be added?

4. **Security considerations**
   - Input validation?
   - Authentication/authorization?
   - Data sanitization?

### Phase 4: Targeted Investigation

For each concern from Phase 3:

1. **Check existing patterns**
   - Use `matrix_find_definition` to see how similar code handles this
   - Use `matrix_recall` to find related solutions

2. **Verify assumptions**
   - Read related files to understand context
   - Check test files for expected behavior

3. **Research if needed**
   - For unfamiliar patterns, query external documentation
   - Use `matrix_recall` for past issues with similar code

### Phase 5: Reflection & Consolidation

Generate final review output in Greptile-style format:

1. **Calculate Confidence Score (1-5)**
   - 5/5: No issues, ready to merge
   - 4/5: Minor suggestions only, approve with optional changes
   - 3/5: Some issues that should be addressed but not blocking
   - 2/5: Important issues that need attention before merge
   - 1/5: Critical bugs or issues that will cause incorrect behavior

2. **Format review output**

```markdown
# Matrix Review

## Summary
[2-3 sentence overview of what this PR/change does and its purpose]

## Key Changes
- [Change 1]: Brief description
- [Change 2]: Brief description
- [Change 3]: Brief description

## Critical Issues Found

### 1. [Issue Title]
[Detailed explanation of the issue, why it's critical, and what behavior it will cause]

### 2. [Issue Title]
[Detailed explanation]

## Additional Issues
- [Minor issue 1]
- [Minor issue 2]

## Positive Aspects
- [Good practice observed]
- [Well-implemented pattern]

## Confidence Score: [N]/5

[Explanation of why this score was given, referencing the critical issues]

**Files requiring attention:** [file1.ts] (critical issue #1), [file2.ts] (critical issue #2)

---

## Important Files Changed

| Filename | Score | Overview |
|----------|-------|----------|
| path/to/file1.ts | 2/5 | Brief description of issues in this file |
| path/to/file2.ts | 1/5 | Brief description of critical issues |
| path/to/file3.ts | 5/5 | No issues found, clean implementation |

### File Analysis

#### `path/to/file1.ts` — Score: 2/5
[Detailed analysis of this file's changes, issues found, and suggestions]

#### `path/to/file2.ts` — Score: 1/5
[Detailed analysis of this file's changes, issues found, and suggestions]
```

3. **Scoring Guidelines per File**
   - 5/5: No issues, clean implementation
   - 4/5: Minor style or documentation suggestions
   - 3/5: Some improvements recommended
   - 2/5: Has bugs or significant issues
   - 1/5: Critical bugs that will cause incorrect behavior

4. **Learning loop**
   - If reviewer spots a pattern that should be remembered:
     Use `matrix_store` to save for future reviews
   - If a recalled solution helped:
     Use `matrix_reward` to improve future recommendations

## Examples

```
/matrix:review src/utils/auth.ts          # Default mode (comprehensive)
/matrix:review staged                     # Review staged changes
/matrix:review staged lazy                # Quick review of staged changes
/matrix:review 123                        # Review PR #123
/matrix:review 123 lazy                   # Quick review of PR #123
```

## Output Location

Review results are displayed inline. For thorough reviews, consider saving to a file:
```
/matrix:review src/auth.ts thorough > ~/Downloads/review-auth.md
```
