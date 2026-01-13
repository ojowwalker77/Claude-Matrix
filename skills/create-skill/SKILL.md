---
name: Create Skill from Matrix Solution
description: This skill should be used when the user asks to "create a skill from solution", "promote solution to skill", "convert matrix solution", "make skill from solution", or wants to transform a Matrix solution into a reusable Claude Code Skill.
user-invocable: true
agent: sonnet
allowed-tools:
  - mcp__plugin_matrix_matrix__matrix_recall
  - mcp__plugin_matrix_matrix__matrix_link_skill
  - Write
  - Read
---

# Matrix Create Skill

Transform a high-value Matrix solution into a reusable Claude Code Skill.

## Usage

Parse user arguments from the skill invocation (text after the trigger phrase).

**Expected format:** `<solution_id> [skill_name]`

- **solution_id** (required): The Matrix solution ID (e.g., `sol_abc123`)
- **skill_name** (optional): Custom skill name (default: auto-generated from problem)

## Process

### Step 1: Retrieve Solution
Query Matrix for the full solution details:
- Problem description
- Solution content
- Code blocks
- Prerequisites
- Anti-patterns
- Tags and category

### Step 2: Generate Skill Template
Create a skill markdown file with:

```markdown
---
description: "[Problem summary]"
---

# [Skill Title]

## Problem
[Original problem from solution]

## Solution
[Solution content]

## Code Examples
[Code blocks if present]

## Prerequisites
[List of prerequisites]

## What NOT to Do
[Anti-patterns]

## Tags
[Tags from solution]

---
*Generated from Matrix solution `sol_xxx`*
```

### Step 3: Write Skill File
Save to: `~/.claude/skills/[skill-name].md`

### Step 4: Link Solution
Use `matrix_link_skill` to:
- Mark solution as promoted
- Record the skill path
- Prevent duplicate promotions

## Output

After successful creation:

```
Skill Created Successfully

  Skill File: ~/.claude/skills/setup-oauth-firebase.md
  Source Solution: sol_abc123

To use this skill:
  1. The skill is automatically available in Claude Code
  2. Reference it naturally: "help me set up OAuth with Firebase"

To edit: Open ~/.claude/skills/setup-oauth-firebase.md
```

## Examples

```
/matrix:create-skill sol_abc123
/matrix:create-skill sol_abc123 firebase-auth-setup
```

## Validation

Before creating:
1. Verify solution exists
2. Check if already promoted (warn if so)
3. Validate skill name (kebab-case, no conflicts)

## Error Handling

- **Solution not found**: List recent candidates with `/matrix:skill-candidates`
- **Already promoted**: Show existing skill path
- **Write failed**: Check permissions on ~/.claude/skills/
