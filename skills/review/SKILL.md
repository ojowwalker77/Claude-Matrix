---
name: Matrix Code Review
description: This skill should be used when the user asks to "review this code", "review PR", "code review", "review staged changes", "blast radius analysis", "check impact of changes", or needs comprehensive context-aware code review.
user-invocable: true
context: fork
allowed-tools:
  - mcp__plugin_matrix_matrix__matrix_find_callers
  - mcp__plugin_matrix_matrix__matrix_find_definition
  - mcp__plugin_matrix_matrix__matrix_search_symbols
  - mcp__plugin_matrix_matrix__matrix_recall
  - mcp__plugin_matrix_matrix__matrix_store
  - mcp__plugin_matrix_matrix__matrix_reward
  - Read
  - Grep
  - Bash
---

# Matrix Code Review

Perform a comprehensive, context-aware code review using Matrix's review pipeline with full index integration.

> **Tip:** This skill runs in a **forked context** for an unbiased perspective - similar to how a human reviewer would approach the code for the first time.

## Usage

Parse user arguments from the skill invocation (text after the trigger phrase).

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

## Review Pipeline

Follow the 5-phase review pipeline detailed in `references/review-phases.md`:

1. **Phase 1: Context Mapping** - Calculate blast radius, find callers, build dependency graph
2. **Phase 2: Intent Inference** - Classify change type, summarize purpose
3. **Phase 3: Socratic Questioning** - Generate probing questions about edge cases, errors, security
4. **Phase 4: Targeted Investigation** - Check patterns, verify assumptions, research
5. **Phase 5: Reflection & Consolidation** - Generate final review with confidence score

## Examples

```
/matrix:review src/utils/auth.ts          # Default mode (comprehensive)
/matrix:review staged                     # Review staged changes
/matrix:review staged lazy                # Quick review of staged changes
/matrix:review 123                        # Review PR #123
/matrix:review 123 lazy                   # Quick review of PR #123
```

## Additional Resources

### Reference Files

For detailed pipeline procedures, consult:
- **`references/review-phases.md`** - Complete 5-phase review process with output format and scoring guidelines
