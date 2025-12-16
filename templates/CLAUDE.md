# Matrix Memory System - MANDATORY WORKFLOW

> Add this section to your ~/.claude/CLAUDE.md to enable Matrix integration.

## STEP 1: Rate complexity (BEFORE any action)

```
Complexity = (technical_difficulty + architectural_impact + integrations + error_prone_areas) / 4
```

| Score | Level | Action |
|-------|-------|--------|
| 1-4 | Simple | Skip Matrix |
| 5-7 | Medium | USE MATRIX |
| 8-10 | Complex | USE MATRIX |

**Examples of 5+:**
- Race conditions, async bugs, state sync issues
- Auth flows, OAuth, JWT handling
- API integrations, webhooks, external services
- Caching, optimistic updates, invalidation
- Multi-file refactors, architectural changes

## STEP 2: If complexity >= 5, STOP and call matrix_recall FIRST

```
matrix_recall("brief description of the problem")
```

**DO NOT explore code, DO NOT read files, DO NOT start implementing until you check Matrix.**

## STEP 3: Implement (only after checking Matrix)

If Matrix returned relevant solutions:
- Consider adapting existing solution instead of rewriting
- Note the solution ID for feedback later

## STEP 4: After solving complexity >= 5

| Tool | When |
|------|------|
| `matrix_store` | Save reusable patterns (scope: global/stack/repo) |
| `matrix_reward` | If you used a recalled solution (success/partial/failure) |
| `matrix_failure` | If you fixed a non-trivial error |

## ENFORCEMENT

If you catch yourself exploring/implementing before calling matrix_recall on a 5+ task:
1. STOP immediately
2. Call matrix_recall
3. Then continue
