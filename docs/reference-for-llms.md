# Claude Matrix - Complete Reference for LLMs

This document contains everything needed to understand, customize, fork, and self-host Claude Matrix.

---

## Overview

Claude Matrix is a plugin for Claude Code that adds:
- **Persistent memory** with semantic search (solutions, failures)
- **Code indexing** for 15 languages with .gitignore support and content hash diffing
- **Automatic hooks** for permissions, security, package auditing
- **Codebase hygiene** via Nuke (dead code, orphans, circular deps)
- **Library docs** via Context7
- **Diagnostics** with auto-fix

**Stack**: Bun, TypeScript, SQLite, MCP SDK, tree-sitter, transformers.js

---

## Project Structure

```
Claude-Matrix/
├── src/
│   ├── index.ts                    # MCP server entry point
│   ├── db/
│   │   ├── client.ts               # SQLite connection (bun:sqlite)
│   │   ├── schema.ts               # Full database schema
│   │   └── migrate.ts              # Flattened schema migrations (v9)
│   ├── embeddings/
│   │   ├── local.ts                # transformers.js embeddings
│   │   └── utils.ts                # cosine similarity
│   ├── tools/
│   │   ├── schemas.ts              # MCP tool definitions
│   │   ├── validation.ts           # TypeBox input validation
│   │   ├── recall.ts               # matrix_recall
│   │   ├── store.ts                # matrix_store
│   │   ├── reward.ts               # matrix_reward
│   │   ├── failure.ts              # matrix_failure
│   │   ├── status.ts               # matrix_status
│   │   ├── warn.ts                 # matrix_warn (consolidated)
│   │   ├── doctor/                 # matrix_doctor diagnostics
│   │   └── index-tools.ts          # Code index tools + dead code + circular deps
│   ├── server/
│   │   └── handlers.ts             # Tool dispatch handler
│   ├── hooks/
│   │   ├── index.ts                # Hook utilities + re-exports
│   │   ├── unified-entry.ts        # Hook dispatcher
│   │   ├── format-helpers.ts       # Verbosity-aware formatters
│   │   ├── rule-engine.ts          # User-configurable rules
│   │   ├── session-start.ts        # Initialize DB, index code
│   │   ├── permission-request.ts   # Auto-approve read-only tools
│   │   ├── pre-tool-read.ts        # Sensitive file detection
│   │   ├── pre-tool-bash.ts        # Package auditing
│   │   ├── pre-tool-edit.ts        # File warnings (cursed files)
│   │   └── pre-tool-web.ts         # Intercept docs lookups -> Context7
│   ├── indexer/
│   │   ├── index.ts                # Main indexer with content hashing
│   │   ├── scanner.ts              # File discovery (.gitignore, symlink safe)
│   │   ├── diff.ts                 # Content hash diffing
│   │   ├── analysis.ts             # Dead code + circular deps + tsconfig paths
│   │   ├── parser.ts               # tree-sitter parsing (per-file timeout)
│   │   ├── store.ts                # Index storage + fuzzy search + find_callers
│   │   └── languages/              # Language-specific extractors (15 langs)
│   ├── repo/
│   │   ├── fingerprint.ts          # Detect project type
│   │   └── store.ts                # Repo CRUD
│   └── config/
│       └── index.ts                # User configuration
├── hooks/
│   └── hooks.json                  # Claude Code hook definitions
├── skills/                         # Slash commands (skills format)
│   ├── list/                       # /matrix:list
│   ├── warn/                       # /matrix:warn
│   ├── reindex/                    # /matrix:reindex
│   ├── doctor/                     # /matrix:doctor
│   ├── review/                     # /matrix:review
│   ├── deep-research/              # /matrix:deep-research
│   └── nuke/                       # /matrix:nuke
├── scripts/
│   ├── run-hooks.sh                # Hook runner
│   └── run-mcp.sh                  # MCP server runner
└── .claude-plugin/
    ├── plugin.json                 # Plugin manifest
    └── marketplace.json            # Marketplace metadata
```

---

## MCP Tools (18 total)

### Memory Tools

| Tool | Purpose | Annotations |
|------|---------|-------------|
| `matrix_recall` | Search solutions by semantic similarity | `readOnlyHint`, `delegable` |
| `matrix_store` | Save a solution | `idempotentHint` |
| `matrix_reward` | Feedback on solution (success/partial/failure) | `idempotentHint`, `delegable` |
| `matrix_failure` | Record an error and its fix | `idempotentHint` |
| `matrix_status` | Get memory statistics | `readOnlyHint`, `delegable` |
| `matrix_get_solution` | Fetch full solution details by ID | `readOnlyHint`, `delegable` |

### Warning Tool

| Tool | Purpose | Annotations |
|------|---------|-------------|
| `matrix_warn` | Unified warning management | `delegable` |

**Actions**: `check`, `add`, `remove`, `list` via `action` parameter.

### Code Index Tools

| Tool | Purpose | Annotations |
|------|---------|-------------|
| `matrix_find_definition` | Find symbol definition | `readOnlyHint`, `delegable` |
| `matrix_find_callers` | Find all files that use a symbol | `readOnlyHint`, `delegable` |
| `matrix_search_symbols` | Fuzzy search symbols by name (filterable by kind) | `readOnlyHint`, `delegable` |
| `matrix_list_exports` | List exports from file/directory | `readOnlyHint`, `delegable` |
| `matrix_get_imports` | Get imports for a file | `readOnlyHint`, `delegable` |
| `matrix_index_status` | Get index status | `readOnlyHint`, `delegable` |
| `matrix_reindex` | Trigger reindexing | `idempotentHint`, `delegable` |
| `matrix_find_dead_code` | Find exported symbols with zero callers and orphaned files | `readOnlyHint`, `delegable` |
| `matrix_find_circular_deps` | Detect circular dependency chains | `readOnlyHint`, `delegable` |

### Other Tools

| Tool | Purpose | Annotations |
|------|---------|-------------|
| `matrix_doctor` | Run diagnostics and auto-fix | `idempotentHint` |

### Delegable Tools (for Haiku sub-agents)

These tools are marked with `_meta.delegable: true`:
```
matrix_recall, matrix_reward, matrix_status
matrix_warn (all actions)
matrix_find_definition, matrix_find_callers, matrix_search_symbols
matrix_list_exports, matrix_get_imports
matrix_index_status, matrix_reindex
matrix_find_dead_code, matrix_find_circular_deps
```

**Not delegable** (require Opus reasoning):
- `matrix_store` - needs judgment on what to store
- `matrix_failure` - needs root cause analysis
- `matrix_doctor` - diagnostics interpretation

---

## Database Schema

SQLite database at `~/.claude/matrix/matrix.db`. Schema version 9.

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
    related_solutions JSON DEFAULT '[]',
    supersedes TEXT,
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
    files_involved JSON DEFAULT '[]',
    occurrences INTEGER DEFAULT 1,
    created_at TEXT
);

-- Warnings (file/package grudges)
CREATE TABLE warnings (
    id TEXT PRIMARY KEY,
    type TEXT CHECK(type IN ('file', 'package')),
    target TEXT NOT NULL,
    ecosystem TEXT,  -- npm, pip, cargo, go
    reason TEXT NOT NULL,
    severity TEXT DEFAULT 'warn' CHECK(severity IN ('info', 'warn', 'block')),
    repo_id TEXT,
    created_at TEXT
);
```

### Code Index Tables

```sql
-- Indexed files (with content hash for reliable change detection)
CREATE TABLE repo_files (
    id INTEGER PRIMARY KEY,
    repo_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    hash TEXT,           -- SHA-256 content hash
    indexed_at TEXT
);

-- Symbols (functions, classes, types)
CREATE TABLE symbols (
    id INTEGER PRIMARY KEY,
    repo_id TEXT NOT NULL,
    file_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,  -- function, class, interface, type, enum, variable, const, method, property, namespace
    line INTEGER NOT NULL,
    column INTEGER DEFAULT 0,
    end_line INTEGER,
    exported INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    scope TEXT,
    signature TEXT
);

-- Imports (including re-exports tracked by TS parser)
CREATE TABLE imports (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL,
    imported_name TEXT NOT NULL,
    local_name TEXT,
    source_path TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    is_namespace INTEGER DEFAULT 0,
    is_type INTEGER DEFAULT 0,
    line INTEGER
);
```

---

## Hooks

Defined in `hooks/hooks.json`:

| Hook | Trigger | What it does |
|------|---------|--------------|
| `SessionStart` | Session begins | Init DB, auto-create config, index code |
| `PermissionRequest` | Tool permission asked | Auto-approve read-only tools (configurable) |
| `PreToolUse:Read` | Before reading file | Detect sensitive files (.env, keys, secrets) |
| `PreToolUse:Bash` | Before shell command | Audit packages (CVEs, deprecation, size) |
| `PreToolUse:Edit/Write` | Before file edit | Check for file warnings (cursed files) |
| `PreToolUse:WebFetch/WebSearch` | Before web lookup | Intercept library docs -> Context7 |

---

## Configuration

File: `~/.claude/matrix/matrix.config` (auto-created on first run)

```json
{
  "search": {
    "defaultLimit": 5,
    "defaultMinScore": 0.3,
    "defaultScope": "all"
  },
  "hooks": {
    "enabled": true,
    "verbosity": "compact",
    "permissions": {
      "autoApproveReadOnly": true,
      "autoApprove": {
        "coreRead": true,
        "web": true,
        "matrixRead": true,
        "context7": true
      }
    },
    "sensitiveFiles": { "enabled": true, "behavior": "ask" },
    "packageAuditor": { "enabled": true, "behavior": "ask" },
    "cursedFiles": { "enabled": true, "behavior": "ask" }
  },
  "indexing": {
    "enabled": true,
    "excludePatterns": [],
    "maxFileSize": 1048576,
    "timeout": 60,
    "includeTests": false
  },
  "toolSearch": {
    "enabled": true,
    "preferMatrixIndex": true,
    "preferContext7": true
  },
  "delegation": { "enabled": true, "model": "haiku" }
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

Tree-sitter grammars downloaded on first use (~1-2MB each):

| Language | Extensions | Grammar |
|----------|------------|---------|
| TypeScript | .ts, .tsx | tree-sitter-typescript |
| JavaScript | .js, .jsx, .mjs, .cjs | tree-sitter-javascript |
| Python | .py | tree-sitter-python |
| Go | .go | tree-sitter-go |
| Rust | .rs | tree-sitter-rust |
| Java | .java | tree-sitter-java |
| Kotlin | .kt, .kts | tree-sitter-kotlin |
| Swift | .swift | tree-sitter-swift |
| C# | .cs | tree-sitter-c-sharp |
| Ruby | .rb | tree-sitter-ruby |
| PHP | .php | tree-sitter-php |
| C | .c, .h | tree-sitter-c |
| C++ | .cpp, .hpp, .cc, .cxx | tree-sitter-cpp |
| Elixir | .ex, .exs | tree-sitter-elixir |
| Zig | .zig | tree-sitter-zig |

### Symbol Kinds Extracted

`function`, `class`, `interface`, `type`, `enum`, `variable`, `const`, `method`, `property`, `namespace`

### Parser Features (v2.4.0)

- Per-file parse timeout (10s) prevents hangs
- Python: decorator extraction (@property, @staticmethod, @classmethod, @dataclass)
- TypeScript: re-export tracking (export { X } from, export * from)
- Content hash diffing for reliable incremental indexing
- .gitignore respected during scanning
- tsconfig path alias resolution for import graph accuracy

---

## Skills (Slash Commands)

| Command | Purpose |
|---------|---------|
| `/matrix:review` | 5-phase code review with impact analysis |
| `/matrix:deep-research` | Multi-source research aggregation |
| `/matrix:nuke` | Codebase hygiene analysis (dead code, orphans, circular deps) |
| `/matrix:doctor` | Diagnostics and auto-fix |
| `/matrix:list` | View solutions, stats, warnings |
| `/matrix:warn` | Manage file/package warnings |
| `/matrix:reindex` | Rebuild code index |

---

## Data Locations

```
~/.claude/matrix/
├── matrix.db              # SQLite database (all data)
├── matrix.config          # Configuration file (auto-created)
├── models/                # Embedding model cache (~23MB)
├── grammars/              # Tree-sitter WASM files (~1-2MB each)
└── .initialized           # Version marker
```

---

## Self-Hosting Guide

### Fork and Customize

1. Clone:
```bash
git clone https://github.com/ojowwalker77/Claude-Matrix
cd Claude-Matrix && bun install
```

2. Test:
```bash
bun test && bun run lint
```

3. Run locally:
```bash
claude --plugin-dir /path/to/your-fork
```

### Key Customization Points

| What | File | Purpose |
|------|------|---------|
| Add new tool | `src/tools/schemas.ts` + `src/server/handlers.ts` | Define schema and handler |
| Add tool validation | `src/tools/validation.ts` | TypeBox input validation |
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
| Context7 | Library docs | Auto-redirect from WebFetch |

---

## License

MIT
