# Matrix

**Persistent memory system for Claude Code** - Learn from past solutions, avoid repeated mistakes.

Matrix gives Claude Code long-term memory across sessions and projects through semantic search over your solution history.

## Why Matrix?

Claude Code is stateless - every session starts fresh. Matrix fixes this by:

- **Recalling solutions** - Search past implementations semantically before coding
- **Learning from failures** - Record errors and fixes to prevent repeating mistakes
- **Building knowledge** - Solutions improve with feedback (reward system)
- **Context awareness** - Solutions tagged by scope (global/stack/repo)

## Features

- **Semantic search** - Find solutions by meaning, not keywords
- **Local embeddings** - 100% offline using `@xenova/transformers`
- **Single SQLite file** - Portable, no external dependencies
- **MCP integration** - Works as Claude Code MCP server
- **Reward system** - Solutions ranked by success rate

## Installation

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- Claude Code v2.0+

### Setup

```bash
# Clone to Claude's config directory
git clone https://github.com/ojowwalker77/Claude-Matrix.git ~/.claude/matrix

# Install dependencies
cd ~/.claude/matrix
bun install

# Register MCP server
claude mcp add matrix -s user -- bun run ~/.claude/matrix/src/index.ts

# Verify
claude mcp list
# Should show: matrix: bun run ... - ✓ Connected
```

### Configure CLAUDE.md

Add to your `~/.claude/CLAUDE.md` (or copy from `templates/CLAUDE.md`):

```markdown
## Matrix Memory System - MANDATORY WORKFLOW

### STEP 1: Rate complexity (BEFORE any action)
Complexity = (technical_difficulty + architectural_impact + integrations + error_prone_areas) / 4
- 1-4: Simple (skip Matrix)
- 5-7: Medium (USE MATRIX)
- 8-10: Complex (USE MATRIX)

### STEP 2: If complexity >= 5, STOP and call matrix_recall FIRST
DO NOT explore code, DO NOT read files, DO NOT start implementing until you check Matrix.

### STEP 3: Implement (only after checking Matrix)

### STEP 4: After solving complexity >= 5
- matrix_store - save reusable patterns
- matrix_reward - if you used a recalled solution
- matrix_failure - if you fixed a non-trivial error
```

## Tools

### matrix_recall

Search for relevant solutions before implementing.

```
matrix_recall("OAuth Google implementation TypeScript")
```

Returns semantically similar solutions with:
- Similarity score (0-1)
- Success rate from past uses
- Related failure patterns to avoid

### matrix_store

Save a solution for future recall.

```
matrix_store(
  problem: "OAuth Google with refresh tokens",
  solution: "Use googleapis library with...",
  scope: "stack",  // global | stack | repo
  tags: ["oauth", "google", "auth"]
)
```

### matrix_reward

Provide feedback after using a recalled solution.

```
matrix_reward(
  solutionId: "sol_abc123",
  outcome: "success",  // success | partial | failure
  notes: "Worked perfectly"
)
```

Score adjustments:
- `success`: +10% toward 1.0
- `partial`: +3%
- `failure`: -15%

### matrix_failure

Record an error and its fix for future prevention.

```
matrix_failure(
  errorType: "runtime",  // runtime | build | test | type | other
  errorMessage: "Cannot read property...",
  rootCause: "Async state not awaited",
  fixApplied: "Added await before setState",
  prevention: "Always await async operations before state updates"
)
```

### matrix_status

Check Matrix memory statistics.

```
matrix_status()
```

## How It Works

### Embeddings

Matrix uses `all-MiniLM-L6-v2` (384 dimensions) via `@xenova/transformers` for 100% local embeddings. First query downloads the model (~80MB), subsequent queries are instant.

### Storage

Single SQLite file (`matrix.db`) with tables:
- `solutions` - Problem/solution pairs with embeddings
- `failures` - Error patterns and fixes
- `repos` - Repository fingerprints (future)
- `usage_log` - Feedback history for scoring

### Scoring

Solutions are ranked by `similarity * score`:
- `similarity` - Semantic match (0-1)
- `score` - Historical success rate (0-1), starts at 0.5

Score decays over time and adjusts based on `matrix_reward` feedback.

## Project Structure

```
~/.claude/matrix/
├── src/
│   ├── index.ts           # MCP server
│   ├── types.ts           # TypeScript types
│   ├── db/
│   │   ├── client.ts      # SQLite client (bun:sqlite)
│   │   └── schema.sql     # Database schema
│   ├── embeddings/
│   │   └── local.ts       # Local transformer embeddings
│   └── tools/
│       ├── recall.ts      # matrix_recall
│       ├── store.ts       # matrix_store
│       ├── reward.ts      # matrix_reward
│       └── failure.ts     # matrix_failure
├── templates/
│   └── CLAUDE.md          # Template for users
├── matrix.db              # SQLite database (created on first run)
├── package.json
└── README.md
```

## Privacy

- **100% local** - No data leaves your machine
- **No API calls** - Embeddings computed locally
- **Single file** - Easy to backup, delete, or inspect

## Roadmap

- [ ] Repository fingerprinting for context-aware scoring
- [ ] Export/import for sharing solutions
- [ ] CLI for manual queries
- [ ] VSCode extension integration

## License

MIT

## Credits

Built for [Claude Code](https://claude.ai/code) by the community.
