# Claude Matrix

#### NOT an official Anthropic tool

**Persistent memory system for Claude Code** - Learn from past solutions, avoid repeated mistakes.

Matrix gives Claude Code long-term memory across sessions and projects through semantic search over your solution history.

## Why Matrix?

Claude Code is stateless - every session starts fresh. Matrix fixes this by:

- **Recalling solutions** - Search past implementations semantically before coding
- **Learning from failures** - Record errors and fixes to prevent repeating mistakes
- **Building knowledge** - Solutions improve with feedback (reward system)
- **Context awareness** - Solutions boosted by repo and tech stack similarity

## Screenshots

### Checking Matrix (matrix_recall)
<img width="1068" alt="Matrix recall in action" src="https://github.com/user-attachments/assets/bccbb0d2-f84d-4b92-b444-16a2acca24cc" />

### Rewarding Solutions (matrix_reward)
<img width="1582" alt="Matrix reward feedback" src="https://github.com/user-attachments/assets/5e818c6b-0652-42f6-8f0d-03579ac955cc" />

## Features

| Feature | Description |
|---------|-------------|
| **Semantic Search** | Find solutions by meaning, not keywords |
| **Local Embeddings** | 100% offline using `@xenova/transformers` |
| **Repo Fingerprinting** | Auto-detect project type and boost similar solutions |
| **Context Boost** | +15% for same repo, +8% for similar tech stack |
| **Single SQLite File** | Portable, no external dependencies |
| **MCP Integration** | Works as Claude Code MCP server |
| **Reward System** | Solutions ranked by success rate |
| **45 Unit Tests** | Comprehensive test coverage with `bun:test` |

## Installation

### Prerequisites

- [Bun](https://bun.sh) v1.0+ (includes native SQLite)
- [Claude Code](https://claude.ai/code) v2.0+

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
# Should show: matrix: bun run ... - Connected
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
- Similarity score (0-1) with context boost
- Success rate from past uses
- Context boost indicator (`same_repo` | `similar_stack`)
- Related failure patterns to avoid

### matrix_store

Save a solution for future recall. Automatically attaches current repo context.

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

Check Matrix memory statistics and current repo info.

```
matrix_status()
```

Returns:
- Current repo name, languages, frameworks, patterns
- Solution/failure/repo counts
- Top tags
- Recent solutions

## How It Works

### Embeddings

Matrix uses `all-MiniLM-L6-v2` (384 dimensions) via `@xenova/transformers` for 100% local embeddings. First query downloads the model (~80MB), subsequent queries are instant.

### Repo Fingerprinting

Matrix automatically detects your project type by reading:

| File | Languages/Frameworks Detected |
|------|------------------------------|
| `package.json` | TypeScript, JavaScript, React, Vue, Express, etc. |
| `Cargo.toml` | Rust, Actix, Axum, Tokio, etc. |
| `pyproject.toml` | Python, FastAPI, Django, Flask, etc. |
| `go.mod` | Go, Gin, Echo, Fiber, etc. |

This fingerprint is used to boost relevance of solutions from similar projects.

### Scoring

Solutions are ranked by `similarity * score`:
- `similarity` - Semantic match (0-1) with context boost
- `score` - Historical success rate (0-1), starts at 0.5

Context boost:
- **Same repo**: similarity × 1.15
- **Similar stack** (>70% fingerprint match): similarity × 1.08

### Storage

Single SQLite file (`matrix.db`) with tables:
- `solutions` - Problem/solution pairs with embeddings and repo_id
- `failures` - Error patterns and fixes
- `repos` - Repository fingerprints with embeddings
- `usage_log` - Feedback history for scoring

## Project Structure

```
~/.claude/matrix/
├── src/
│   ├── index.ts              # MCP server entry (minimal)
│   ├── server/
│   │   └── handlers.ts       # Tool call dispatcher
│   ├── tools/
│   │   ├── index.ts          # Barrel exports
│   │   ├── schemas.ts        # MCP tool schemas
│   │   ├── recall.ts         # matrix_recall
│   │   ├── store.ts          # matrix_store
│   │   ├── reward.ts         # matrix_reward
│   │   ├── failure.ts        # matrix_failure
│   │   └── status.ts         # matrix_status
│   ├── repo/
│   │   ├── fingerprint.ts    # Project detection
│   │   └── store.ts          # Repo persistence
│   ├── db/
│   │   ├── client.ts         # SQLite client
│   │   └── schema.sql        # Database schema
│   ├── embeddings/
│   │   └── local.ts          # Transformer embeddings
│   ├── types/
│   │   ├── tools.ts          # Tool types
│   │   └── db.ts             # Database types
│   └── __tests__/            # Unit tests (45 tests)
├── docs/                     # Documentation
├── templates/
│   └── CLAUDE.md             # Template for users
├── matrix.db                 # SQLite database
├── CHANGELOG.md              # Version history
├── package.json
└── README.md
```

## Development

```bash
# Run tests
bun test

# Type check
bun run --bun tsc --noEmit

# Start server (for debugging)
bun run src/index.ts
```

## Privacy

- **100% local** - No data leaves your machine
- **No API calls** - Embeddings computed locally
- **Single file** - Easy to backup, delete, or inspect

## Roadmap

- [x] Repository fingerprinting for context-aware scoring
- [x] Unit tests with bun:test
- [x] Modular architecture
- [ ] Export/import for sharing solutions
- [ ] CLI for manual queries
- [ ] VSCode extension integration

## License

MIT

## Credits

Built for [Claude Code](https://claude.ai/code) by the community.

See [CHANGELOG.md](CHANGELOG.md) for version history.
