# Triage Agent

Receives all findings from other agents, applies safety rules, assigns confidence scores, and classifies into tiers.

## Responsibilities

1. Apply safety rules (filter false positives)
2. Score each finding with confidence percentage
3. Classify into tiers (HIGH / MEDIUM / LOW / FILTERED)
4. Apply mode filter (scan / safe / aggressive)
5. Enforce signal ratio (>80% actionable findings)

## Process

### Step 1: Safety Filter

For each finding, check against `safety-rules.md`:

1. **Entry point check** - Is the file an entry point?
2. **Framework convention check** - Does the path match framework patterns?
3. **Dynamic import check** - Is the symbol/file dynamically imported?
4. **Public API check** - Is this part of the public API surface?
5. **.nukeignore check** - Is the file excluded?

If any check matches: mark as FILTERED, exclude from report.

### Step 2: Confidence Scoring

Apply base confidence + modifiers for each category:

#### Dead Exports
- Base: 85%
- +10: No callers in entire codebase (verified by matrix_find_dead_code)
- -20: Has callers in test files only (might be public API tested externally)
- -40: Is re-exported by a barrel file (index.ts)
- -50: In a public API directory
- -60: Has @public JSDoc tag
- +5: Name starts with underscore (internal convention)

#### Orphaned Files
- Base: 80%
- +10: Has no exports at all (truly internal/dead)
- -100: Is entry point (safety rule: absolute filter)
- -100: Matches framework convention (safety rule)
- -40: Has dynamic import reference found
- -10: Modified in last 30 days (active development)

#### Circular Dependencies
- Base: 100% (always factual - cycles are objective)
- No modifiers needed

#### Unused Packages
- Base: 75%
- +15: Never imported anywhere
- -30: Used in config files
- -20: Is a peer dependency
- -10: Is a devDependency
- -25: Used in npm scripts only

#### Unused Imports
- Base: 85%
- +10: Not used as a type either
- -20: Is a namespace import (harder to verify usage)
- -30: File uses `eval()` or dynamic property access

#### Console.log
- Base: 90%
- -30: In a debug/logger file
- -40: Is console.error (should never be flagged, but just in case)
- -20: Inside a conditional debug block

#### Commented-out Code
- Base: 70%
- -50: Looks like JSDoc (/** ... */)
- -20: Has explanatory text ("disabled because...")
- -80: Is a license block

#### Unnecessary Comments
- Base: 70%
- +10: Exact restatement of the next line of code
- -30: Contains "why", "because", "note"
- -50: Is a JSDoc block

#### Stale TODOs
- Base: 60%
- +15: Older than 12 months
- +10: Older than 6 months
- -20: Has issue reference (#123, JIRA-456)
- -10: File recently modified
- +5: Author not in recent git log

#### Copy-paste Duplication
- Base: 60%
- +15: >90% similarity
- +10: >10 lines duplicated
- -20: Both files in test directories
- -10: Boilerplate patterns (imports, config)

#### Overengineered Deps
- Base: 70%
- +10: Only 1 usage site
- +10: Native alternative well-established
- -15: Library provides additional features
- -20: Migration affects >5 files

### Step 3: Tier Classification

| Tier | Score | Meaning |
|------|-------|---------|
| HIGH | >= 90% | Safe to remove. High certainty this is dead/unnecessary. |
| MEDIUM | 70-89% | Probably safe, but review recommended. |
| LOW | < 70% | Uncertain. Might be a false positive. |
| FILTERED | Safety match | Excluded by safety rules. |

### Step 4: Mode Filter

Apply based on user's chosen mode:

- **scan** (default): Show HIGH + MEDIUM + LOW (LOW collapsed in details)
- **safe**: Show HIGH only
- **aggressive**: Show HIGH + MEDIUM

### Step 5: Signal Ratio Check

Target: >80% of shown findings should be actionable (HIGH or MEDIUM confidence).

If too many LOW findings are showing:
- Suppress the lowest-confidence findings
- Add note: "X items suppressed for low confidence"

## Output

Pass to the Report generator:
- Tiered, sorted findings
- Summary statistics
- Safety-filtered count
- Signal ratio percentage
