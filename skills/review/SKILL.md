---
name: Matrix Code Review
description: This skill should be used when the user asks to "review this code", "review PR", "code review", "review staged changes", "blast radius analysis", "check impact of changes", or needs comprehensive context-aware code review.
user-invocable: true
context: fork
allowed-tools:
  # Matrix Code Index
  - mcp__plugin_matrix_matrix__matrix_find_callers
  - mcp__plugin_matrix_matrix__matrix_find_definition
  - mcp__plugin_matrix_matrix__matrix_search_symbols
  - mcp__plugin_matrix_matrix__matrix_list_exports
  - mcp__plugin_matrix_matrix__matrix_get_imports
  - mcp__plugin_matrix_matrix__matrix_index_status
  # Matrix Nuke (Hygiene Analysis)
  - mcp__plugin_matrix_matrix__matrix_find_dead_code
  - mcp__plugin_matrix_matrix__matrix_find_circular_deps
  # Matrix Memory
  - mcp__plugin_matrix_matrix__matrix_recall
  - mcp__plugin_matrix_matrix__matrix_store
  - mcp__plugin_matrix_matrix__matrix_reward
  - mcp__plugin_matrix_matrix__matrix_failure
  # Context7 - Library Documentation
  - mcp__plugin_matrix_context7__resolve-library-id
  - mcp__plugin_matrix_context7__query-docs
  # Standard Tools
  - Read
  - Grep
  - Glob
  - Bash
---

# Matrix Code Review

Perform comprehensive, context-aware code review using 5-agent architecture with 95% false positive reduction.

> **Tip:** This skill runs in a **forked context** for an unbiased perspective - similar to how a human reviewer would approach the code for the first time.

## Architecture

```
ORCHESTRATOR (parses target, routes, aggregates)
     │
     ├── DETECTION AGENT → security, runtime, breaking, logic flaws, hygiene (nuke)
     ├── IMPACT AGENT → blast radius, transitive graph, test coverage
     ├── TRIAGE AGENT → tier assignment, confidence calibration, noise filter
     ├── REMEDIATION AGENT → context-aware fixes, regression checks
     └── VERIFICATION AGENT → build, test, lint validation
```

## Usage

Parse user arguments from the skill invocation (text after the trigger phrase).

**Expected format:** `<target> [mode]`

- **target**: File path, PR number, or "staged" for staged changes
- **mode** (optional): `default` | `lazy` (default: from config or `default`)

## Modes

### Default Mode (Comprehensive)
Full 5-agent review pipeline with maximum index utilization:
- Detection: Security vulns, runtime issues, breaking changes, **hygiene (nuke scan)**
- Impact: Transitive blast radius (2-3 levels), service boundaries, test coverage
- Triage: Tier classification, >80% signal ratio target
- Remediation: Context-aware fixes matching codebase patterns
- Verification: Run build, test, lint commands automatically

### Lazy Mode (Quick)
Detection agent only:
- Direct code inspection
- Critical issues only (Tier 1)
- ~2-3 comments, no blast radius

## Review Pipeline

Follow the 5-agent orchestration detailed in `references/review-phases.md`:

1. **Orchestrator** - Parse target, dispatch agents, aggregate results
2. **Detection Agent** - Find security, runtime, breaking, logic issues
3. **Impact Agent** - Calculate transitive blast radius, test coverage
4. **Triage Agent** - Classify tiers, calibrate confidence, filter noise
5. **Remediation Agent** - Generate fixes, check regression risk
6. **Verification Agent** - Run build, test, lint; report results

**Early exit:** If Detection finds nothing critical, skip Impact/Triage depth.

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

- **`references/review-phases.md`** - Orchestrator + 5-agent pipeline
- **`references/agents/detection.md`** - Detection patterns and output format
- **`references/agents/impact.md`** - Blast radius algorithm
- **`references/agents/triage.md`** - Tier classification and signal ratio
- **`references/agents/remediation.md`** - Fix generation and regression checks
- **`references/agents/verification.md`** - Build/test/lint command detection and execution
