# Tools Reference

Complete reference for all Matrix MCP tools.

## matrix_recall

Search for relevant solutions from past experience.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Problem description to search for |
| `limit` | number | No | 5 | Maximum results to return |
| `minScore` | number | No | 0.3 | Minimum similarity threshold (0-1) |
| `scopeFilter` | string | No | "all" | Filter by scope: `all`, `global`, `stack`, `repo` |

### Response

```typescript
{
  query: string;
  solutions: Array<{
    id: string;              // sol_xxxxxxxx
    problem: string;         // Original problem
    solution: string;        // Solution content
    scope: string;           // global | stack | repo
    tags: string[];          // ["auth", "oauth"]
    similarity: number;      // 0-1 (with context boost)
    score: number;           // Historical success rate
    uses: number;            // Times recalled
    successRate: number;     // successes / (successes + failures)
    contextBoost?: string;   // "same_repo" | "similar_stack"
  }>;
  totalFound: number;        // Total matches before limit
  relatedFailures?: Array<{  // Error patterns to avoid
    id: string;
    errorType: string;
    errorMessage: string;
    rootCause: string;
    fixApplied: string;
    similarity: number;
  }>;
}
```

### Example

```typescript
matrix_recall({
  query: "OAuth Google TypeScript refresh tokens",
  limit: 3,
  minScore: 0.5,
  scopeFilter: "stack"
})
```

---

## matrix_store

Save a solution for future recall.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `problem` | string | Yes | Problem that was solved |
| `solution` | string | Yes | The solution (code, steps, explanation) |
| `scope` | string | Yes | `global` (any project), `stack` (same tech), `repo` (this repo) |
| `tags` | string[] | No | Tags for categorization |
| `filesAffected` | string[] | No | Files that were modified |

### Response

```typescript
{
  id: string;        // sol_xxxxxxxx
  status: "stored";
  problem: string;   // Truncated to 100 chars
  scope: string;
  tags: string[];
}
```

### Notes

- Automatically attaches current repo context (repo_id)
- Generates embedding from problem text
- Initial score is 0.5

### Example

```typescript
matrix_store({
  problem: "Implementing OAuth with Google in TypeScript with refresh token handling",
  solution: `
    1. Install googleapis: bun add googleapis
    2. Create OAuth2 client with credentials
    3. Store refresh token securely
    4. Use token.on('tokens') to capture new refresh tokens
    ...
  `,
  scope: "stack",
  tags: ["oauth", "google", "typescript", "auth"],
  filesAffected: ["src/auth/google.ts", "src/config/oauth.ts"]
})
```

---

## matrix_reward

Provide feedback on a recalled solution.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `solutionId` | string | Yes | ID from matrix_recall |
| `outcome` | string | Yes | `success`, `partial`, or `failure` |
| `notes` | string | No | What worked or what needed changes |

### Response

```typescript
{
  solutionId: string;
  outcome: string;
  previousScore: number;
  newScore: number;
  message: string;  // "Score updated: 0.50 → 0.55"
}
```

### Score Adjustments

| Outcome | Formula | Effect |
|---------|---------|--------|
| `success` | `score + 0.1 * (1 - score)` | +10% toward 1.0 (asymptotic) |
| `partial` | `min(1.0, score + 0.03)` | +3% flat |
| `failure` | `max(0.1, score - 0.15)` | -15% (floor at 0.1) |

### Example

```typescript
matrix_reward({
  solutionId: "sol_abc12345",
  outcome: "success",
  notes: "Worked perfectly, just had to update the API version"
})
```

---

## matrix_failure

Record an error pattern and its fix.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `errorType` | string | Yes | `runtime`, `build`, `test`, `type`, `other` |
| `errorMessage` | string | Yes | The error message |
| `rootCause` | string | Yes | What actually caused the error |
| `fixApplied` | string | Yes | How it was fixed |
| `stackTrace` | string | No | Stack trace if available |
| `prevention` | string | No | How to avoid in future |
| `filesInvolved` | string[] | No | Files related to error |

### Response

```typescript
{
  id: string;           // fail_xxxxxxxx
  status: string;       // "recorded" | "updated"
  errorType: string;
  occurrences: number;  // Count if duplicate
  message: string;
}
```

### Deduplication

Errors are deduplicated by signature (SHA256 hash of normalized message):
- Numbers → `N`
- String literals → `STR`
- File paths → `PATH`
- Hex addresses → `HEX`

If the same error is recorded again, occurrences is incremented.

### Example

```typescript
matrix_failure({
  errorType: "runtime",
  errorMessage: "TypeError: Cannot read property 'map' of undefined at UserList.tsx:42",
  rootCause: "API returned null instead of empty array when no users",
  fixApplied: "Added nullish coalescing: users ?? []",
  prevention: "Always provide default empty array for list data",
  filesInvolved: ["src/components/UserList.tsx", "src/api/users.ts"]
})
```

---

## matrix_status

Get Matrix memory statistics.

### Parameters

None.

### Response

```typescript
{
  status: "operational";
  database: "connected";
  currentRepo: {
    name: string;        // Current project name
    languages: string[]; // ["typescript"]
    frameworks: string[];// ["react", "express"]
    patterns: string[];  // ["api"]
  };
  stats: {
    solutions: number;   // Total solutions
    failures: number;    // Total failure patterns
    repos: number;       // Total repos tracked
  };
  topTags: string[];     // Top 10 most used tags
  recentSolutions: Array<{
    id: string;
    problem: string;
    scope: string;
    score: number;
    created_at: string;
  }>;
}
```

### Example

```typescript
matrix_status()
// {
//   status: "operational",
//   database: "connected",
//   currentRepo: {
//     name: "claude-matrix",
//     languages: ["typescript"],
//     frameworks: [],
//     patterns: []
//   },
//   stats: { solutions: 42, failures: 15, repos: 8 },
//   topTags: ["auth", "api", "database", ...],
//   recentSolutions: [...]
// }
```

---

## Best Practices

### When to Use Each Tool

| Situation | Tool |
|-----------|------|
| Starting a non-trivial task | `matrix_recall` first |
| Solved a reusable problem | `matrix_store` |
| Used a recalled solution | `matrix_reward` |
| Fixed a non-trivial error | `matrix_failure` |
| Checking what's stored | `matrix_status` |

### Scope Guidelines

| Scope | When to Use |
|-------|-------------|
| `global` | Language-agnostic patterns (git, CLI, algorithms) |
| `stack` | Tech-specific solutions (React patterns, FastAPI middleware) |
| `repo` | Project-specific solutions (custom auth flow, specific API) |

### Good Problem Descriptions

❌ Bad: "OAuth"
✅ Good: "OAuth Google implementation with TypeScript and refresh token handling"

❌ Bad: "Fix bug"
✅ Good: "Race condition in async state update causing stale data render"

### Tagging Strategy

Use consistent, hierarchical tags:
- `auth`, `auth:oauth`, `auth:oauth:google`
- `api`, `api:rest`, `api:graphql`
- `database`, `database:postgres`, `database:migrations`
