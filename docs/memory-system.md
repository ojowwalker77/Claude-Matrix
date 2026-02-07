# Matrix Memory System

The Memory System is Matrix's learning core - a feedback-driven knowledge base that stores solutions, tracks failures, and improves recommendations over time based on actual outcomes.

---

## Overview

Matrix doesn't just store solutions; it learns which ones work. The memory system:

1. **Stores** solutions with semantic embeddings for meaning-based search
2. **Recalls** relevant solutions using similarity + success scoring
3. **Rewards** solutions based on actual outcomes
4. **Records failures** to prevent repeated mistakes

This creates a feedback loop: solutions that work rise to the top, while those that fail sink or evolve.

---

## The Four Core Operations

### Store (`matrix_store`)

Saving a solution for future recall.

**Input:**
```javascript
{
  problem: "How to implement rate limiting in Express.js",
  solution: "Use express-rate-limit middleware with Redis store...",
  scope: "stack",
  category: "pattern",
  tags: ["express", "rate-limiting", "redis"],
  codeBlocks: [{
    language: "typescript",
    code: "const limiter = rateLimit({...})",
    description: "Rate limiter configuration"
  }]
}
```

**Process:**
1. Generate semantic embedding from problem description
2. Check for duplicates (similarity > 0.9)
3. If duplicate exists, return existing solution ID
4. Calculate complexity score (1-10)
5. Store with initial score of 0.5
6. Link to current repository

**Output:**
```javascript
{
  id: "sol_abc123",
  status: "stored",  // or "duplicate"
  problem: "How to implement rate limiting...",
  scope: "stack",
  complexity: 4
}
```

### Recall (`matrix_recall`)

Finding relevant solutions for a problem.

**Input:**
```javascript
{
  query: "Express middleware for limiting API requests",
  limit: 5,
  minScore: 0.3,
  scopeFilter: "stack"
}
```

**Process:**
1. Generate query embedding
2. Scan all solutions, compute cosine similarity
3. Apply context boosts:
   - Same repository: +15%
   - Similar tech stack: +8%
4. Filter by minimum similarity threshold
5. Rank by combined score: `similarity × quality_score`
6. Return top N matches
7. Increment usage counter for returned solutions

**Output:**
```javascript
{
  query: "Express middleware for limiting API requests",
  solutions: [
    {
      id: "sol_abc123",
      problem: "How to implement rate limiting in Express.js",
      solution: "Use express-rate-limit middleware...",
      similarity: 0.87,
      score: 0.75,
      uses: 12,
      successRate: 0.83,
      contextBoost: "similar_stack",
      category: "pattern",
      complexity: 4
    }
  ],
  totalFound: 3
}
```

### Reward (`matrix_reward`)

Providing feedback on a recalled solution.

**Input:**
```javascript
{
  solutionId: "sol_abc123",
  outcome: "success",  // or "partial" or "failure"
  notes: "Worked perfectly, also needed to configure Redis"
}
```

**Process:**
1. Fetch current solution score
2. Adjust score based on outcome:
   - Success: `score + 0.1 × (1 - score)` (asymptotic to 1.0)
   - Partial: `score + 0.03` (capped at 1.0)
   - Failure: `score - 0.15` (floor at 0.1)
3. Update outcome counters (successes, partial_successes, failures)
4. Log to usage history

**Score Evolution:**
```
Initial:  0.50
Success:  0.55  (+0.05)
Success:  0.60  (+0.045)
Success:  0.64  (+0.04)
Failure:  0.49  (-0.15)
Success:  0.54  (+0.05)
```

The asymptotic formula prevents scores from reaching 1.0 too easily, requiring consistent success to achieve high scores.

### Failure (`matrix_failure`)

Recording an error and its fix for prevention.

**Input:**
```javascript
{
  errorType: "runtime",
  errorMessage: "TypeError: Cannot read property 'id' of undefined",
  stackTrace: "at UserService.getUser (user.ts:42)...",
  rootCause: "User object not checked for null before accessing",
  fixApplied: "Added null check before property access",
  prevention: "Always validate objects before accessing nested properties",
  filesInvolved: ["src/services/user.ts"]
}
```

**Process:**
1. Normalize error message (remove variable parts):
   - Numbers → `N`
   - Paths → `PATH`
   - Strings → `STR`
2. Compute signature hash from normalized message
3. Check if signature exists:
   - Yes: Increment occurrence count, update fix
   - No: Create new failure record with embedding
4. Store embedding for semantic search

**Error Normalization Example:**
```
Original: "TypeError at /Users/john/app/src/utils.ts:42"
Normalized: "TypeError at PATH:N"
Signature: "a7f3c9d2..."
```

This allows recognizing the same error across:
- Different machines
- Different line numbers
- Different file paths

---

## Scope System

Solutions have three scope levels determining when they appear:

### Global
- Language-agnostic patterns
- Universal best practices
- Always searchable

**Examples:**
- "How to structure error handling"
- "Git workflow for feature branches"
- "API versioning strategies"

### Stack
- Technology-specific patterns
- Framework conventions
- Searchable when tech stack matches

**Examples:**
- "React useEffect cleanup patterns"
- "Express middleware ordering"
- "Go error wrapping conventions"

### Repo
- Project-specific patterns
- Local conventions
- Only searchable in the same repository

**Examples:**
- "How to add a new API endpoint here"
- "Testing patterns for this codebase"
- "Deployment process for this project"

---

## Scoring Algorithm

Solutions are ranked by a combined score:

```
final_score = similarity × quality_score × context_boost
```

**Similarity** (0-1)
- Cosine similarity between query and problem embeddings
- Higher = more semantically similar

**Quality Score** (0.1-1.0)
- Starts at 0.5
- Increases with successful outcomes
- Decreases with failures
- Never drops below 0.1 (solutions can recover)

**Context Boost** (1.0-1.15)
- Same repository: 1.15×
- Similar tech stack: 1.08×
- No match: 1.0×

**Example Ranking:**
```
Query: "Implement OAuth"

Solution A:
  similarity: 0.85
  quality_score: 0.70
  context_boost: 1.15 (same repo)
  final: 0.85 × 0.70 × 1.15 = 0.684

Solution B:
  similarity: 0.90
  quality_score: 0.55
  context_boost: 1.0 (no match)
  final: 0.90 × 0.55 × 1.0 = 0.495

Winner: Solution A (more proven in this context)
```

---

## Solution Evolution

Solutions can evolve through the `supersedes` relationship.

**Initial Solution:**
```
sol_abc123: "Use bcrypt for password hashing"
```

**Improved Version:**
```
sol_def456: "Use Argon2id for password hashing (more secure than bcrypt)"
supersedes: sol_abc123
```

**What Happens:**
- Both solutions remain in the database
- Recall results show when a solution has been superseded
- Users can choose the original or updated version
- Chains are allowed: A → B → C

This preserves history while surfacing improvements.

---

## Duplicate Detection

Before storing, Matrix checks for duplicates:

1. Generate embedding for new problem
2. Search existing solutions with similarity > 0.9
3. If found, return existing solution instead

**Why 0.9?**
- High enough to catch true duplicates
- Low enough to allow variations
- "Implement OAuth" and "How to implement OAuth" = duplicate
- "Implement OAuth" and "OAuth with refresh tokens" = different

---

## Category System

Solutions are categorized for filtering:

| Category | Use Case |
|----------|----------|
| bugfix | Fixing incorrect behavior |
| feature | Implementing new functionality |
| refactor | Restructuring code |
| config | Configuration and setup |
| pattern | Reusable design patterns |
| optimization | Performance improvements |

Filter by category:
```javascript
matrix_recall({
  query: "authentication",
  categoryFilter: "security"
})
```

---

## Complexity Scoring

Complexity (1-10) helps filter solutions by difficulty:

**Auto-calculated based on:**
- Solution length (longer = more complex)
- Number of code blocks
- Number of prerequisites
- Number of files affected

**Manual override:**
```javascript
matrix_store({
  problem: "...",
  solution: "...",
  complexity: 8  // Expert-level solution
})
```

**Filter by complexity:**
```javascript
matrix_recall({
  query: "authentication",
  maxComplexity: 5  // Beginner-friendly solutions only
})
```

---

## Memory Lifecycle

### Creation
1. Solution stored with initial score 0.5
2. Linked to current repository
3. Embedding generated and stored

### Active Use
1. Recalled when query matches
2. Usage counter incremented
3. Last-used timestamp updated

### Feedback Loop
1. User reports outcome (success/partial/failure)
2. Score adjusted accordingly
3. Usage logged for analytics

### Evolution
1. Better solution created with `supersedes` link
2. Old solution marked but preserved
3. New solution starts fresh at 0.5

---

## Best Practices

### When to Store
- Solved a non-trivial problem
- Pattern is reusable
- Solution took significant effort to discover

### When NOT to Store
- One-line fixes
- Obvious solutions
- User errors (typos, wrong commands)
- Temporary workarounds

### Writing Good Problems
```
Bad: "Fixed auth"
Good: "How to handle expired JWT tokens with automatic refresh"

Bad: "Database issue"
Good: "PostgreSQL connection pool exhaustion under high load"
```

### Writing Good Solutions
```
Bad: "Used the package"
Good: "1. Install express-rate-limit
      2. Configure Redis store for distributed rate limiting
      3. Apply middleware to specific routes
      [code example]
      4. Test with artillery for load testing"
```

### Providing Feedback
- Always reward recalled solutions that helped
- Be honest about failures (improves future recommendations)
- Add notes about what needed adjustment

---

## Summary

The Matrix Memory System creates a learning loop:

```
Store → Recall → Use → Reward → Better Rankings → Better Recalls
```

Over time:
- Good solutions rise (high success rate)
- Bad solutions sink (but can recover)
- Context matters (same repo/stack boosted)
- Duplicates prevented (embedding similarity)
- Evolution tracked (supersedes chains)

This transforms isolated problem-solving into cumulative learning.
