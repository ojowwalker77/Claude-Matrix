# Configuration

How to configure Matrix for optimal use.

## Installation

### Prerequisites

- [Bun](https://bun.sh) v1.0+ (includes native SQLite)
- [Claude Code](https://claude.ai/code) v2.0+

### Setup Steps

```bash
# 1. Clone to Claude's config directory
git clone https://github.com/ojowwalker77/Claude-Matrix.git ~/.claude/matrix

# 2. Install dependencies
cd ~/.claude/matrix
bun install

# 3. Register MCP server
claude mcp add matrix -s user -- bun run ~/.claude/matrix/src/index.ts

# 4. Verify connection
claude mcp list
# Should show: matrix: bun run ... - Connected
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MATRIX_DB` | `~/.claude/matrix/matrix.db` | Database file path |

Example:
```bash
MATRIX_DB=/path/to/custom/matrix.db bun run src/index.ts
```

## CLAUDE.md Configuration

Add to `~/.claude/CLAUDE.md` for automatic Matrix integration:

### Minimal Configuration

```markdown
## Matrix Memory System

Before implementing complexity 5+ tasks, call:
- `matrix_recall("problem description")`

After solving, call:
- `matrix_store` - save reusable solutions
- `matrix_reward` - feedback on recalled solutions
- `matrix_failure` - record error patterns
```

### Full Configuration (Recommended)

```markdown
## Matrix Memory System - MANDATORY WORKFLOW

### STEP 1: Rate complexity (BEFORE any action)
```
Complexity = (technical_difficulty + architectural_impact + integrations + error_prone_areas) / 4
```
- 1-4: Simple (skip Matrix)
- 5-7: Medium (USE MATRIX)
- 8-10: Complex (USE MATRIX)

Examples of 5+: race conditions, async bugs, state sync, auth flows, OAuth, external APIs, caching, optimistic updates, multi-file changes

### STEP 2: If complexity >= 5, STOP and call matrix_recall FIRST
```
matrix_recall("brief description of the problem")
```
DO NOT explore code, DO NOT read files, DO NOT start implementing until you check Matrix.

### STEP 3: Implement (only after checking Matrix)

### STEP 4: After solving complexity >= 5
- `matrix_store` - save reusable patterns (scope: global/stack/repo)
- `matrix_reward` - if you used a recalled solution (success/partial/failure)
- `matrix_failure` - if you fixed a non-trivial error

### ENFORCEMENT
If you catch yourself exploring/implementing before calling matrix_recall on a 5+ task:
1. STOP immediately
2. Call matrix_recall
3. Then continue
```

## Database Location

Default: `~/.claude/matrix/matrix.db`

The database is a single SQLite file with WAL mode enabled. You can:
- **Backup**: Copy `matrix.db`, `matrix.db-wal`, `matrix.db-shm`
- **Reset**: Delete these files (new DB created on next run)
- **Inspect**: Use any SQLite client (`sqlite3`, DBeaver, etc.)

## MCP Server Configuration

The server is registered with Claude Code via:

```bash
claude mcp add matrix -s user -- bun run ~/.claude/matrix/src/index.ts
```

This adds to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "matrix": {
      "command": "bun",
      "args": ["run", "/Users/you/.claude/matrix/src/index.ts"],
      "scope": "user"
    }
  }
}
```

### Removing Matrix

```bash
claude mcp remove matrix
```

### Checking Status

```bash
claude mcp list
```

## Performance Tuning

### For Large Solution Counts (>1000)

Matrix uses brute-force vector search. For very large databases:

1. **Use scope filters**: Narrow search with `scopeFilter: "repo"` or `"stack"`
2. **Increase minScore**: Default 0.3, try 0.5 for more relevant results
3. **Limit results**: Default 5, reduce if needed

### Database Indexes

Matrix includes indexes for common queries:

```sql
-- Solutions
idx_solutions_repo (repo_id)
idx_solutions_scope (scope)
idx_solutions_score (score DESC)
idx_solutions_scope_score (scope, score DESC)
idx_solutions_created (created_at DESC)

-- Failures
idx_failures_repo (repo_id)
idx_failures_signature (error_signature)
idx_failures_type (error_type)

-- Usage
idx_usage_solution (solution_id)
idx_usage_created (created_at DESC)
```

## Troubleshooting

### "Cannot connect to matrix"

1. Check if server is running: `claude mcp list`
2. Verify path is correct in settings
3. Try removing and re-adding: `claude mcp remove matrix && claude mcp add ...`

### "Model download taking too long"

First query downloads ~80MB model. Subsequent queries use cache at:
- macOS: `~/.cache/huggingface/`
- Linux: `~/.cache/huggingface/`

### "Database locked"

Ensure only one Matrix instance is running. Check for stale processes:
```bash
ps aux | grep matrix
```

### Resetting Everything

```bash
cd ~/.claude/matrix
rm -f matrix.db matrix.db-wal matrix.db-shm
bun install
```

## Logs

Matrix logs errors to stderr. To see logs:

```bash
# Run manually
bun run ~/.claude/matrix/src/index.ts 2>&1 | tee matrix.log
```

## Development Mode

For debugging:

```bash
cd ~/.claude/matrix

# Run tests
bun test

# Type check
bun run --bun tsc --noEmit

# Watch mode (auto-restart on changes)
bun --watch src/index.ts
```
