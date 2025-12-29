# Claude Matrix - Complete Reference for LLMs

This document contains everything needed to understand, customize, fork, and self-host Claude Matrix.

---

## Overview

Claude Matrix is a plugin for Claude Code that adds:
- **Persistent memory** with semantic search (solutions, failures)
- **Code indexing** for 10 languages
- **Automatic hooks** for context injection
- **External repo packing** via Repomix
- **Library docs** via Context7

**Stack**: Bun, TypeScript, SQLite, MCP SDK, tree-sitter, transformers.js

---

## Project Structure

```
Claude-Matrix/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── db/
│   │   ├── client.ts         # SQLite connection (bun:sqlite)
│   │   ├── schema.ts         # Full database schema
│   │   └── migrate.ts        # Schema migrations
│   ├── embeddings/
│   │   ├── local.ts          # transformers.js embeddings
│   │   └── utils.ts          # cosine similarity
│   ├── tools/
│   │   ├── schemas.ts        # MCP tool definitions
│   │   ├── recall.ts         # matrix_recall implementation
│   │   ├── store.ts          # matrix_store implementation
│   │   ├── reward.ts         # matrix_reward implementation
│   │   ├── failure.ts        # matrix_failure implementation
│   │   ├── status.ts         # matrix_status implementation
│   │   ├── warn.ts           # matrix_warn_* implementations
│   │   ├── prompt.ts         # matrix_prompt implementation
│   │   └── index-tools.ts    # Code index tools
│   ├── server/
│   │   └── handlers.ts       # Tool dispatch handler
│   ├── hooks/
│   │   ├── session-start.ts  # Initialize DB, index code
│   │   ├── user-prompt-submit.ts  # Analyze prompts
│   │   ├── pre-tool-bash.ts  # Package auditing
│   │   ├── pre-tool-edit.ts  # File warnings
│   │   ├── pre-tool-web.ts   # Context7 redirect
│   │   ├── post-tool-bash.ts # Log installs
│   │   └── stop-session.ts   # Offer to save solutions
│   ├── indexer/
│   │   ├── index.ts          # Main indexer
│   │   ├── parser.ts         # tree-sitter parsing
│   │   └── languages/        # Language-specific extractors
│   ├── repo/
│   │   ├── fingerprint.ts    # Detect project type
│   │   └── store.ts          # Repo CRUD
│   ├── repomix/
│   │   └── index.ts          # External repo packing
│   └── config/
│       └── index.ts          # User configuration
├── hooks/
│   └── hooks.json            # Claude Code hook definitions
├── commands/                  # Slash command definitions
├── scripts/
│   ├── run-hooks.sh          # Hook runner
│   └── run-mcp.sh            # MCP server runner
└── .claude-plugin/
    ├── plugin.json           # Plugin manifest
    └── marketplace.json      # Marketplace metadata
```

---

## MCP Tools (17 total)

### Memory Tools

| Tool | Purpose | Annotations |
|------|---------|-------------|
| `matrix_recall` | Search solutions by semantic similarity | `readOnlyHint` |
| `matrix_store` | Save a solution | `idempotentHint` |
| `matrix_reward` | Feedback on solution (success/partial/failure) | `idempotentHint`, `delegable` |
| `matrix_failure` | Record an error and its fix | `idempotentHint` |
| `matrix_status` | Get memory statistics | `readOnlyHint`, `delegable` |

### Warning Tools

| Tool | Purpose | Annotations |
|------|---------|-------------|
| `matrix_warn_check` | Check if file/package has warnings | `readOnlyHint`, `delegable` |
| `matrix_warn_add` | Add a warning | `idempotentHint`, `delegable` |
| `matrix_warn_remove` | Remove a warning | `destructiveHint`, `delegable` |
| `matrix_warn_list` | List all warnings | `readOnlyHint`, `delegable` |

### Code Index Tools

| Tool | Purpose | Annotations |
|------|---------|-------------|
| `matrix_find_definition` | Find symbol definition | `readOnlyHint` |
| `matrix_search_symbols` | Search symbols by partial name | `readOnlyHint` |
| `matrix_list_exports` | List exports from file/directory | `readOnlyHint` |
| `matrix_get_imports` | Get imports for a file | `readOnlyHint` |
| `matrix_index_status` | Get index status | `readOnlyHint`, `delegable` |
| `matrix_reindex` | Trigger reindexing | `idempotentHint`, `delegable` |

### Other Tools

| Tool | Purpose | Annotations |
|------|---------|-------------|
| `matrix_prompt` | Analyze prompt for ambiguity | `readOnlyHint` |
| `matrix_repomix` | Pack external repos | `readOnlyHint`, `openWorldHint` |

### Delegable Tools (for Haiku)

These 8 tools are marked with `_meta.delegable: true` for sub-agent routing:
```
matrix_status, matrix_index_status, matrix_reindex, matrix_reward
matrix_warn_check, matrix_warn_add, matrix_warn_remove, matrix_warn_list
```

---

## Database Schema

SQLite database at `~/.claude/matrix/matrix.db`

### Core Tables

```sql
-- Solutions (learned patterns)
CREATE TABLE solutions (
    id TEXT PRIMARY KEY,
    repo_id TEXT,
    problem TEXT NOT NULL,
    problem_embedding BLOB NOT NULL,
    solution TEXT NOT NULL,
    scope TEXT CHECK(scope IN ('global', 'stack', 'repo')),
    context JSON DEFAULT '{}',
    tags JSON DEFAULT '[]',
    score REAL DEFAULT 0.5,
    uses INTEGER DEFAULT 0,
    successes INTEGER DEFAULT 0,
    category TEXT,  -- bugfix, feature, refactor, config, pattern, optimization
    complexity INTEGER CHECK(complexity >= 1 AND complexity <= 10),
    prerequisites JSON DEFAULT '[]',
    anti_patterns JSON DEFAULT '[]',
    code_blocks JSON DEFAULT '[]',
    created_at TEXT,
    updated_at TEXT
);

-- Failures (error patterns)
CREATE TABLE failures (
    id TEXT PRIMARY KEY,
    repo_id TEXT,
    error_type TEXT CHECK(error_type IN ('runtime', 'build', 'test', 'type', 'other')),
    error_message TEXT NOT NULL,
    error_signature TEXT NOT NULL,
    error_embedding BLOB NOT NULL,
    stack_trace TEXT,
    root_cause TEXT,
    fix_applied TEXT,
    prevention TEXT,
    occurrences INTEGER DEFAULT 1,
    created_at TEXT
);

-- Repos (project fingerprints)
CREATE TABLE repos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT,
    languages JSON DEFAULT '[]',
    frameworks JSON DEFAULT '[]',
    patterns JSON DEFAULT '[]',
    fingerprint_embedding BLOB
);

-- Warnings (file/package grudges)
CREATE TABLE warnings (
    id TEXT PRIMARY KEY,
    type TEXT CHECK(type IN ('file', 'package')),
    target TEXT NOT NULL,
    ecosystem TEXT,  -- npm, pip, cargo, go
    reason TEXT NOT NULL,
    severity TEXT DEFAULT 'warn' CHECK(severity IN ('info', 'warn', 'block')),
    repo_id TEXT
);
```

### Code Index Tables

```sql
-- Indexed files
CREATE TABLE repo_files (
    id INTEGER PRIMARY KEY,
    repo_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    hash TEXT
);

-- Symbols (functions, classes, types)
CREATE TABLE symbols (
    id INTEGER PRIMARY KEY,
    repo_id TEXT NOT NULL,
    file_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,  -- function, class, interface, type, enum, variable, const
    line INTEGER NOT NULL,
    exported INTEGER DEFAULT 0,
    signature TEXT
);

-- Imports
CREATE TABLE imports (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL,
    imported_name TEXT NOT NULL,
    source_path TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    is_type INTEGER DEFAULT 0
);
```

---

## Hooks

Defined in `hooks/hooks.json`:

| Hook | Trigger | What it does |
|------|---------|--------------|
| `SessionStart` | Session begins | Init DB, index code (10 languages) |
| `UserPromptSubmit` | User sends message | Analyze complexity, inject relevant memories |
| `PreToolUse:Bash` | Before shell command | Audit packages (CVEs, deprecation, size) |
| `PreToolUse:Edit` | Before file edit | Check for file warnings |
| `PreToolUse:WebFetch` | Before web fetch | Redirect library docs to Context7 |
| `PostToolUse:Bash` | After shell command | Log package installations |
| `Stop` | Session ends | Offer to save significant solutions |

---

## Configuration

File: `~/.claude/matrix.config`

```json
{
  "search": {
    "defaultLimit": 5,
    "defaultMinScore": 0.3,
    "defaultScope": "all"
  },
  "hooks": {
    "enabled": true,
    "complexityThreshold": 5,
    "enableApiCache": false,
    "cacheTtlHours": 24,
    "auditorTimeout": 30
  },
  "indexing": {
    "enabled": true,
    "excludePatterns": [],
    "maxFileSize": 1048576,
    "timeout": 60,
    "includeTests": false
  },
  "display": {
    "colors": true,
    "boxWidth": 55,
    "truncateLength": 40
  }
}
```

---

## Embeddings

Uses `@xenova/transformers` with `Xenova/all-MiniLM-L6-v2` model:
- 384-dimensional embeddings
- Model cached at `~/.claude/matrix/models/` (~23MB)
- Cosine similarity for search

---

## Supported Languages (Code Index)

Tree-sitter grammars downloaded on first use:

| Language | Extensions | Grammar |
|----------|------------|---------|
| TypeScript | .ts, .tsx | tree-sitter-typescript |
| JavaScript | .js, .jsx, .mjs | tree-sitter-javascript |
| Python | .py | tree-sitter-python |
| Go | .go | tree-sitter-go |
| Rust | .rs | tree-sitter-rust |
| Java | .java | tree-sitter-java |
| C | .c, .h | tree-sitter-c |
| C++ | .cpp, .hpp, .cc | tree-sitter-cpp |
| Ruby | .rb | tree-sitter-ruby |
| PHP | .php | tree-sitter-php |

---

## Self-Hosting Guide

### Fork & Customize

1. Fork the repo:
```bash
git clone https://github.com/ojowwalker77/Claude-Matrix
cd Claude-Matrix
```

2. Install dependencies:
```bash
bun install
```

3. Customize:
- Edit `src/tools/schemas.ts` to add/modify tools
- Edit `src/hooks/*.ts` to customize hook behavior
- Edit `src/config/index.ts` for default settings
- Edit `hooks/hooks.json` to enable/disable hooks

4. Test locally:
```bash
bun test
claude --plugin-dir /path/to/your-fork
```

### Create Your Own Plugin

1. Update `.claude-plugin/plugin.json`:
```json
{
  "name": "your-matrix",
  "description": "Your custom Matrix",
  "version": "1.0.0",
  "author": { "name": "Your Name" },
  "repository": "https://github.com/you/your-matrix"
}
```

2. Update `.claude-plugin/marketplace.json`:
```json
{
  "id": "you/your-matrix",
  "name": "your-matrix",
  "displayName": "Your Matrix",
  "publisher": "you"
}
```

3. Push to GitHub

4. Install your version:
```
/plugin marketplace add you/your-matrix
/plugin install your-matrix@you-your-matrix
```

### Key Customization Points

| What | File | Purpose |
|------|------|---------|
| Add new tool | `src/tools/schemas.ts` + `src/server/handlers.ts` | Define schema and handler |
| Modify recall scoring | `src/tools/recall.ts` | Change similarity thresholds |
| Add language support | `src/indexer/languages/` | Add tree-sitter grammar |
| Change hook behavior | `src/hooks/*.ts` | Modify automatic actions |
| Disable a hook | `hooks/hooks.json` | Remove hook entry |
| Change defaults | `src/config/index.ts` | Modify DEFAULT_CONFIG |

---

## API Integrations

| Service | Purpose | Used By |
|---------|---------|---------|
| OSV.dev | CVE database | Package auditing |
| npm registry | Package metadata | Deprecation check |
| Bundlephobia | Bundle size | Size warnings |
| GitHub API | Repo cloning | Repomix |
| Context7 | Library docs | WebFetch hook |

---

## Performance Optimizations

### Token Savings
- Compact JSON output (~10-15% reduction)
- Two-phase Repomix (index free, pack on confirm)
- Haiku-delegable tools for simple operations

### MCP Annotations
All 17 tools have official hints:
- `readOnlyHint` - No side effects
- `idempotentHint` - Safe to retry
- `destructiveHint` - Deletes data
- `openWorldHint` - External API calls

---

## Slash Commands

| Command | Handler |
|---------|---------|
| `/matrix:search <query>` | `commands/search.md` |
| `/matrix:list` | `commands/list.md` |
| `/matrix:stats` | `commands/stats.md` |
| `/matrix:warn` | `commands/warn.md` |
| `/matrix:export` | `commands/export.md` |
| `/matrix:verify` | `commands/verify.md` |
| `/matrix:reindex` | `commands/reindex.md` |
| `/matrix:repomix` | `commands/repomix.md` |

---

## Data Locations

```
~/.claude/matrix/
├── matrix.db       # SQLite database (all data)
├── models/         # Embedding model cache (~23MB)
├── grammars/       # Tree-sitter WASM files (~1-2MB each)
├── repomix-cache/  # Cached repo packs
└── .initialized    # Version marker
```

---

## License

MIT - Fork freely, customize as needed.
