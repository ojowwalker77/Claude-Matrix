---
description: Conduct a multi-phase code review with blast radius analysis
---

# Matrix Code Review

Perform a comprehensive, context-aware code review using Matrix's 5-phase review pipeline.

## Usage

Parse arguments: `$ARGUMENTS`

**Expected format:** `<target> [depth]`

- **target**: File path, PR number, or "staged" for staged changes
- **depth** (optional): `quick` | `standard` | `thorough` (default: `standard`)

## Depth Levels

- **quick**: Single-pass review, main issues only (~2-3 comments)
- **standard**: Full pipeline, balanced coverage (~5-10 comments)
- **thorough**: Deep analysis, edge cases, security review (~10+ comments)

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

Generate final review output:

1. **Prioritize findings**
   - Critical: Must fix before merge
   - Important: Should fix, may defer
   - Suggestion: Nice to have improvements
   - Praise: Things done well

2. **Format review comments**
```markdown
## Code Review Summary

**Change Type:** [bugfix|feature|refactor|...]
**Blast Radius:** [low|medium|high] - [N] files directly affected
**Overall Assessment:** [Approve|Request Changes|Comment]

### Critical Issues
- [File:Line] Issue description
  Suggestion: How to fix

### Important Items
- [File:Line] Issue description
  Suggestion: How to improve

### Suggestions
- [File:Line] Suggestion description

### What's Done Well
- [Positive observation]
```

3. **Learning loop**
   - If reviewer spots a pattern that should be remembered:
     Use `matrix_store` to save for future reviews
   - If a recalled solution helped:
     Use `matrix_reward` to improve future recommendations

## Examples

```
/matrix:review src/utils/auth.ts standard
/matrix:review staged thorough
/matrix:review 123 quick
```

## Output Location

Review results are displayed inline. For thorough reviews, consider saving to a file:
```
/matrix:review src/auth.ts thorough > ~/Downloads/review-auth.md
```
