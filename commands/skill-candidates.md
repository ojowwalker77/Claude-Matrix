---
description: List Matrix solutions that are good candidates for promotion to Claude Code Skills
---

# Matrix Skill Candidates

Identify high-value Matrix solutions that can be promoted to Claude Code Skills for reuse.

## Usage

Use the `matrix_skill_candidates` MCP tool to find promotable solutions.

Parse optional arguments: `$ARGUMENTS`

**Argument patterns:**
- `top 5` or `limit 5` - Limit to N candidates
- `threshold 0.8` - Minimum success rate threshold
- `all` - Include already promoted solutions

## Default Criteria

Solutions are considered candidates if they have:
- **Success rate >= 70%** - High confidence solutions
- **Uses >= 3** - Proven through repeated application
- **Not yet promoted** - Unless `all` flag provided

## Output Format

For each candidate, display:

```
[1] Solution ID: sol_abc123
    Problem: [Short problem description]
    Success Rate: 85% (17/20 uses)
    Complexity: 5/10
    Category: feature
    Suggested Skill Name: setup-oauth-firebase
    Promotion Score: 87/100
```

## Promotion Score

The promotion score (0-100) combines:
- **Success rate** (0-50 points): Higher success = higher score
- **Usage count** (0-30 points): More uses = more proven
- **Complexity** (0-20 points): Medium complexity (4-7) preferred

## Next Steps

After identifying candidates:
1. Review the solution details: `/matrix:list solutions`
2. Create a skill: `/matrix:create-skill <solution_id>`

## Example

```
/matrix:skill-candidates
/matrix:skill-candidates top 3
/matrix:skill-candidates threshold 0.9
```
