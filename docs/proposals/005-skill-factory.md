# Feature Proposal: Skill Factory

**Proposal ID:** MATRIX-005
**Author:** Claude Matrix Team
**Status:** Draft
**Created:** 2025-01-09
**Based on:** [Discussion #47](https://github.com/ojowwalker77/Claude-Matrix/discussions/47)
**Type:** New Feature

---

## Executive Summary

Introduce a **Skill Factory** system that identifies high-value Matrix solutions and helps promote them to Claude Code Skills. This bridges the gap between **stored knowledge** (Matrix) and **executable automation** (Skills).

**Key insight from Discussion #47:**
> Matrix = Recipe (you still need to cook)
> Skill = Ready meal (just serve) + quality analysis

**Our approach:** Conservative implementation that captures the value without the risks of auto-generation.

---

## The Problem

### Knowledge vs Automation Gap

| Aspect | Matrix Solution | Claude Code Skill |
|--------|-----------------|-------------------|
| What it stores | Problem + solution text + code blocks | Executable script + instructions |
| Execution | Claude reads and applies manually | Script runs directly |
| Discovery | Explicit `matrix_recall` | Automatic by context |
| Consistency | Varies (Claude interprets each time) | Identical every time |
| Added value | Reusable pattern | Complete automation |

### Real Example

**Task:** Extract all resources from a cloud API

**Using Matrix (knowledge):**
```
1. matrix_recall("extract cloud resources")
2. Claude reads solution
3. Claude executes 15 REST calls manually
4. Claude handles errors as they occur
5. Claude formats output
6. Result: Works, but ~10 minutes of back-and-forth
```

**Using Skill (automation):**
```
1. /cloud-extractor
2. Script runs with proper error handling
3. Result: Formatted output in 30 seconds
```

### The Observation

Some Matrix solutions are used repeatedly with high success rates. These are **candidates for promotion to Skills** - but currently there's no system to:

1. Identify these candidates
2. Help create Skills from them
3. Link Skills back to their origin solutions

---

## Proposed Solution

### Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SKILL FACTORY FLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PHASE 1: ACCUMULATION                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Solutions accumulate usage stats via matrix_reward:          │   │
│  │ • Total uses                                                 │   │
│  │ • Success rate                                               │   │
│  │ • Has code blocks?                                           │   │
│  │ • Complexity level                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  PHASE 2: CANDIDATE DETECTION                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Matrix identifies skill candidates when:                     │   │
│  │ • uses >= 3                                                  │   │
│  │ • successRate >= 70%                                         │   │
│  │ • hasCodeBlocks == true                                      │   │
│  │ • complexity <= 7 (not too complex to automate)              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  PHASE 3: HUMAN DECISION                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ /matrix:skill-candidates                                     │   │
│  │ Shows list of promotable solutions                           │   │
│  │ Human selects which to promote                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  PHASE 4: SKILL CREATION (Claude-assisted)                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ /matrix:create-skill {solutionId}                            │   │
│  │ Claude writes the skill based on:                            │   │
│  │ • Solution's problem/solution description                    │   │
│  │ • Code blocks (cleaned, no secrets)                          │   │
│  │ • Best practices for error handling                          │   │
│  │ Creates: ~/.claude/skills/{name}/SKILL.md + scripts/         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  PHASE 5: LINKAGE                                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Solution updated with:                                       │   │
│  │ • promotedToSkill: "skill-name"                              │   │
│  │ • promotedAt: timestamp                                      │   │
│  │                                                              │   │
│  │ Future matrix_recall returns:                                │   │
│  │ • "This solution has been promoted to skill: /skill-name"    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## What We're NOT Doing

Based on critical analysis of Discussion #47, we're explicitly **rejecting**:

| Rejected Idea | Why |
|---------------|-----|
| Execution log recording | Database bloat, may capture secrets |
| Auto-generate scripts from logs | Security risk, no error handling |
| Automation score calculation | Too subjective, hard to implement reliably |
| Matrix as orchestrator | Inverts control - Claude decides, Matrix informs |
| `matrix_promote` creates Skills automatically | Claude should write intelligently, not replay |

**Our philosophy:** Matrix *identifies candidates* and *provides context*. Claude *writes the skill* intelligently. Human *approves and refines*.

---

## Technical Design

### Schema Changes

```sql
-- Add promotion tracking to solutions table
ALTER TABLE solutions ADD COLUMN promoted_to_skill TEXT;
ALTER TABLE solutions ADD COLUMN promoted_at TEXT;

-- No execution_log (rejected - too heavy)
-- No automation_score (rejected - too subjective)
```

### Skill Candidate Detection

```typescript
interface SkillCandidate {
  solutionId: string;
  problem: string;
  uses: number;
  successRate: number;
  hasCodeBlocks: boolean;
  complexity: number;
  codeLanguages: string[];
  lastUsed: string;
  candidateScore: number;  // Simple weighted score
}

function detectSkillCandidates(): SkillCandidate[] {
  const db = getDb();

  // Query solutions with usage stats
  const candidates = db.query(`
    SELECT
      s.id,
      s.problem,
      s.solution,
      s.code_blocks,
      s.complexity,
      s.created_at,
      s.uses,
      CASE WHEN (s.successes + s.failures) > 0 
        THEN CAST(s.successes AS REAL) / (s.successes + s.failures)
        ELSE 0.5 
      END as success_rate,
      s.last_used_at as last_used
    FROM solutions s
    LEFT JOIN rewards r ON s.id = r.solution_id
    WHERE s.promoted_to_skill IS NULL
    GROUP BY s.id
    HAVING
      uses >= 3
      AND success_rate >= 0.7
      AND s.code_blocks IS NOT NULL
      AND s.complexity <= 7
    ORDER BY uses * success_rate DESC
    LIMIT 20
  `).all();

  return candidates.map(c => ({
    solutionId: c.id,
    problem: c.problem,
    uses: c.uses,
    successRate: c.success_rate,
    hasCodeBlocks: c.code_blocks != null,
    complexity: c.complexity,
    codeLanguages: extractLanguages(c.code_blocks),
    lastUsed: c.last_used,
    candidateScore: c.uses * c.success_rate * (8 - c.complexity) / 8,
  }));
}
```

### New MCP Tool: `matrix_skill_candidates`

```typescript
interface SkillCandidatesInput {
  minUses?: number;      // Default: 3
  minSuccessRate?: number; // Default: 0.7
  limit?: number;        // Default: 10
}

interface SkillCandidatesOutput {
  candidates: SkillCandidate[];
  totalEligible: number;
}

// Returns list of solutions ready for skill promotion
```

### New MCP Tool: `matrix_link_skill`

```typescript
interface LinkSkillInput {
  solutionId: string;
  skillName: string;
  skillPath?: string;  // Default: ~/.claude/skills/{skillName}
}

interface LinkSkillOutput {
  success: boolean;
  solution: {
    id: string;
    problem: string;
    promotedToSkill: string;
    promotedAt: string;
  };
}

// Links an existing solution to a skill (after Claude creates it)
```

### Modified `matrix_recall` Response

```typescript
interface RecallResult {
  // Existing fields...
  solutions: Solution[];

  // New field
  skillNote?: string;
  // Example: "Note: Solution 'cloud-extractor-pattern' was promoted to skill /cloud-extractor on 2025-01-09"
}
```

---

## Commands

### `/matrix:skill-candidates`

```markdown
---
description: Show Matrix solutions ready for promotion to Skills
---

# Skill Candidates

List Matrix solutions that are good candidates for promotion to Claude Code Skills.

## Criteria

A solution becomes a candidate when:
- Used 3+ times
- Success rate >= 70%
- Has code blocks
- Complexity <= 7 (automatable)

## Display

For each candidate show:
- Problem summary
- Uses / Success rate
- Code languages detected
- Candidate score
- Last used date

## Actions

After showing candidates, ask user:
"Would you like to create a skill from any of these? Reply with the solution ID."
```

### `/matrix:create-skill`

```markdown
---
description: Create a Claude Code Skill from a Matrix solution
argument-hint: Solution ID to promote
allowed-tools: [Read, Write, Bash, mcp__plugin_matrix_matrix__matrix_link_skill]
---

# Create Skill from Matrix Solution

Create a Claude Code Skill based on Matrix solution: $ARGUMENTS

## Process

1. **Fetch the solution**
   - Read solution details from Matrix
   - Extract problem, solution, code blocks

2. **Design the skill**
   - Determine skill name (kebab-case, descriptive)
   - Identify required parameters
   - Plan error handling

3. **Write SKILL.md**
   ```markdown
   ---
   name: {skill-name}
   description: {from solution.problem}
   version: 1.0.0
   ---

   # {Skill Name}

   {Instructions for Claude on how to use this skill}

   ## Parameters
   {If any}

   ## What This Skill Does
   {Clear description}

   ## Error Handling
   {How to handle failures}
   ```

4. **Write scripts (if needed)**
   - Based on solution's code blocks
   - Add proper error handling
   - Remove any hardcoded secrets/paths
   - Make configurable via arguments

5. **Create skill directory**
   ```
   ~/.claude/skills/{skill-name}/
   ├── SKILL.md
   └── scripts/
       └── main.{ext}
   ```

6. **Link back to Matrix**
   - Call matrix_link_skill to update the solution
   - Future recalls will note the skill exists

## Important

- NEVER include secrets, API keys, or hardcoded paths
- ALWAYS add error handling
- Make scripts configurable via arguments
- Test the skill after creation
```

---

## User Experience

### Discovery Flow

```
User: /matrix:skill-candidates

Claude: Found 3 solutions ready for skill promotion:

┌─────────────────────────────────────────────────────────────────────┐
│ ID: sol_abc123                                                      │
│ Problem: Extract cloud resources via REST API                       │
│ Uses: 8 | Success: 87% | Score: 6.5                                │
│ Languages: Python, Bash                                             │
│ Last used: 2 days ago                                               │
├─────────────────────────────────────────────────────────────────────┤
│ ID: sol_def456                                                      │
│ Problem: Generate TypeScript types from OpenAPI spec                │
│ Uses: 5 | Success: 100% | Score: 5.0                               │
│ Languages: TypeScript                                               │
│ Last used: 1 week ago                                               │
├─────────────────────────────────────────────────────────────────────┤
│ ID: sol_ghi789                                                      │
│ Problem: Batch resize images with quality optimization              │
│ Uses: 4 | Success: 75% | Score: 3.0                                │
│ Languages: Python                                                   │
│ Last used: 3 days ago                                               │
└─────────────────────────────────────────────────────────────────────┘

Would you like to create a skill from any of these?
Reply with the solution ID (e.g., "sol_abc123").
```

### Creation Flow

```
User: Create a skill from sol_abc123

Claude: I'll create a skill from "Extract cloud resources via REST API".

[Reads solution from Matrix]
[Analyzes code blocks]
[Writes SKILL.md]
[Writes scripts/main.py]

Created skill at ~/.claude/skills/cloud-extractor/:
├── SKILL.md (skill definition)
└── scripts/main.py (extraction script)

The skill is now available as /cloud-extractor.

Matrix solution sol_abc123 has been linked to this skill.
Future recalls will note: "Promoted to skill: /cloud-extractor"
```

### Recall With Skill Note

```
User: How do I extract cloud resources?

Claude: [Calls matrix_recall]

Found relevant solution:
- "Extract cloud resources via REST API"
- Note: This solution was promoted to skill /cloud-extractor on 2025-01-09

You can either:
1. Use /cloud-extractor for automated extraction
2. Follow the manual steps in the solution
```

---

## Benefits

| Benefit | Description |
|---------|-------------|
| **Natural evolution** | Knowledge → Candidate → Skill is organic |
| **Human in the loop** | User decides what to promote |
| **Claude writes intelligently** | Not blind replay, actual skill authoring |
| **Fallback available** | If skill breaks, solution still exists |
| **Continuous improvement** | Matrix keeps learning even after promotion |
| **No bloat** | No execution logs, no complex scoring |

---

## Comparison to Discussion #47

| Aspect | Discussion #47 | Our Approach |
|--------|----------------|--------------|
| Execution logging | Store every command | **No** - too heavy |
| Automation score | Complex calculation | **Simple heuristic** - uses × success |
| Draft generation | Auto from logs | **Claude writes** intelligently |
| Matrix as orchestrator | Matrix decides | **Matrix informs**, Claude decides |
| Promotion mechanism | matrix_promote creates skill | **Claude creates**, matrix_link_skill links |
| Skill tracking | skill_executions table | **Use matrix_reward** on linked solution |

---

## Implementation Plan

### Phase 1: Detection (Week 1)

- [ ] Add `promoted_to_skill`, `promoted_at` columns
- [ ] Implement `detectSkillCandidates()` function
- [ ] Create `matrix_skill_candidates` MCP tool
- [ ] Create `/matrix:skill-candidates` command

### Phase 2: Creation (Week 2)

- [ ] Create `matrix_link_skill` MCP tool
- [ ] Create `/matrix:create-skill` command
- [ ] Modify `matrix_recall` to include skill notes
- [ ] Test skill creation flow end-to-end

### Phase 3: Polish (Week 3)

- [ ] Add skill health tracking (rewards on linked solution)
- [ ] Handle skill deletion (unlink from solution)
- [ ] Documentation and examples

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Skills created from Matrix | 5+ per active user/month | Count promotions |
| Skill usage after creation | 3+ uses per skill | Track via rewards |
| Time to create skill | < 5 minutes | User feedback |
| Fallback rate | < 10% | Skills that break |

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Low adoption | Medium | Clear documentation, proactive suggestions |
| Skills with bugs | Medium | Claude adds error handling, user tests |
| Orphaned solutions | Low | Link back ensures connection |
| Scope creep | Medium | Strict rejection of auto-generation |

---

## Conclusion

The Skill Factory bridges Matrix's knowledge storage with Claude Code's automation capabilities. By:

1. **Detecting** high-value solutions automatically
2. **Surfacing** candidates to users
3. **Assisting** skill creation via Claude
4. **Linking** skills back to their origin

We create a natural evolution path from "knowledge I've used before" to "automation I can run instantly" - without the risks of auto-generation or the complexity of execution logging.

**Key principle:** Matrix identifies, Claude creates, human approves.

---

**Decision:** Implement Skill Factory as described.

**Next Steps:**
1. Review with discussion author
2. Prioritize implementation phases
3. Begin Phase 1 development

---

## Acknowledgments

This proposal is based on the excellent ideas in [Discussion #47](https://github.com/ojowwalker77/Claude-Matrix/discussions/47) by the Matrix community. We've refined the approach to balance value with implementation pragmatism.
