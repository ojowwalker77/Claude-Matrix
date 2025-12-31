# Claude Matrix - Complete Reference for LLMs

This document contains everything needed to understand, customize, fork, and self-host Claude Matrix.

---

## Overview

Claude Matrix is a plugin for Claude Code that adds:
- **Persistent memory** with semantic search (solutions, failures)
- **Code indexing** for 15 languages
- **Automatic hooks** for permissions, security, context injection
- **External repo packing** via Repomix
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
│   │   └── migrate.ts              # Schema migrations
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
│   │   ├── warn.ts                 # matrix_warn_*
│   │   ├── prompt.ts               # matrix_prompt
│   │   ├── doctor.ts               # matrix_doctor
│   │   └── index-tools.ts          # Code index tools
│   ├── server/
│   │   └── handlers.ts             # Tool dispatch handler
│   ├── hooks/
│   │   ├── index.ts                # Hook dispatcher
│   │   ├── session-start.ts        # Initialize DB, index code
│   │   ├── user-prompt-submit.ts   # Analyze prompts, inject memories
│   │   ├── permission-request.ts   # Auto-approve read-only tools
│   │   ├── pre-tool-read.ts        # Sensitive file detection
│   │   ├── pre-tool-bash.ts        # Package auditing
│   │   ├── pre-tool-edit.ts        # File warnings (cursed files)
│   │   ├── pre-compact.ts          # Session analysis before compaction
│   │   ├── post-tool-bash.ts       # Log installs
│   │   └── stop-session.ts         # Offer to save solutions
│   ├── indexer/
│   │   ├── index.ts                # Main indexer
│   │   ├── parser.ts               # tree-sitter parsing
│   │   ├── store.ts                # Index storage
│   │   └── languages/              # Language-specific extractors
│   │       ├── base.ts             # Base parser class
│   │       ├── typescript.ts       # TS/JS
│   │       ├── python.ts
│   │       ├── go.ts
│   │       ├── rust.ts
│   │       ├── java.ts
│   │       ├── kotlin.ts
│   │       ├── swift.ts
│   │       ├── csharp.ts
│   │       ├── ruby.ts
│   │       ├── php.ts
│   │       ├── c.ts
│   │       ├── cpp.ts
│   │       ├── elixir.ts
│   │       └── zig.ts
│   ├── repo/
│   │   ├── fingerprint.ts          # Detect project type
│   │   └── store.ts                # Repo CRUD
│   ├── repomix/
│   │   └── index.ts                # External repo packing
│   └── config/
│       └── index.ts                # User configuration
├── hooks/
│   └── hooks.json                  # Claude Code hook definitions
├── commands/                       # Slash command definitions
├── scripts/
│   ├── build.ts                    # Build script
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
| `matrix_find_definition` | Find symbol definition | `readOnlyHint`, `delegable` |
| `matrix_search_symbols` | Search symbols by partial name | `readOnlyHint`, `delegable` |
| `matrix_list_exports` | List exports from file/directory | `readOnlyHint`, `delegable` |
| `matrix_get_imports` | Get imports for a file | `readOnlyHint`, `delegable` |
| `matrix_index_status` | Get index status | `readOnlyHint`, `delegable` |
| `matrix_reindex` | Trigger reindexing | `idempotentHint`, `delegable` |

### Other Tools

| Tool | Purpose | Annotations |
|------|---------|-------------|
| `matrix_prompt` | Analyze prompt for ambiguity | `readOnlyHint` |
| `matrix_repomix` | Pack external repos (two-phase) | `readOnlyHint`, `openWorldHint` |
| `matrix_doctor` | Run diagnostics and auto-fix | `idempotentHint` |

### Delegable Tools (for Haiku sub-agents)

These 13 tools are marked with `_meta.delegable: true`:
```
matrix_recall, matrix_reward, matrix_status
matrix_warn_check, matrix_warn_add, matrix_warn_remove, matrix_warn_list
matrix_find_definition, matrix_search_symbols, matrix_list_exports, matrix_get_imports
matrix_index_status, matrix_reindex
```

**Not delegable** (require Opus reasoning):
- `matrix_store` - needs judgment on what to store
- `matrix_failure` - needs root cause analysis
- `matrix_prompt` - meta-analysis of prompts
- `matrix_repomix` - complex two-phase flow
- `matrix_doctor` - diagnostics interpretation

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
    repo_id TEXT,
    created_at TEXT
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
    hash TEXT,
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

-- Imports
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
| `SessionStart` | Session begins | Init DB, auto-create config, index code (15 languages) |
| `PermissionRequest` | Tool permission asked | Auto-approve read-only tools (configurable) |
| `UserPromptSubmit` | User sends message | Analyze complexity, inject relevant memories, detect code nav |
| `PreToolUse:Read` | Before reading file | Detect sensitive files (.env, keys, secrets) |
| `PreToolUse:Bash` | Before shell command | Audit packages (CVEs, deprecation, size) |
| `PreToolUse:Edit` | Before file edit | Check for file warnings (cursed files) |
| `PreCompact` | Before context compaction | Analyze session, extract insights, suggest saving |
| `PostToolUse:Bash` | After shell command | Log package installations |
| `Stop` | Session ends | Offer to save significant solutions |

### Hook Configuration

Each hook can be configured in `~/.claude/matrix/matrix.config`:

```json
{
  "hooks": {
    "permissions": {
      "autoApproveReadOnly": true,
      "autoApprove": {
        "coreRead": true,      // Read, Glob, Grep
        "web": true,           // WebFetch, WebSearch
        "matrixRead": true,    // matrix_recall, status, find_definition, etc.
        "context7": true       // resolve-library-id, query-docs
      },
      "neverAutoApprove": ["matrix_store", "matrix_warn_add"],
      "additionalAutoApprove": []
    },
    "sensitiveFiles": {
      "enabled": true,
      "behavior": "ask",       // warn, block, ask, disabled
      "patterns": {
        "envFiles": true,
        "keysAndCerts": true,
        "secretDirs": true,
        "configFiles": true,
        "passwordFiles": true,
        "cloudCredentials": true
      },
      "customPatterns": [],
      "allowList": [".env.example", ".env.template"]
    },
    "preCompact": {
      "enabled": true,
      "behavior": "suggest",   // suggest, auto-save, disabled
      "autoSaveThreshold": 6,
      "logToFile": true
    },
    "packageAuditor": {
      "enabled": true,
      "behavior": "ask",
      "checks": {
        "cve": true,
        "deprecated": true,
        "bundleSize": true,
        "localWarnings": true
      },
      "blockOnCriticalCVE": true
    },
    "cursedFiles": {
      "enabled": true,
      "behavior": "ask"
    }
  }
}
```

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
  "merge": {
    "defaultThreshold": 0.8
  },
  "list": {
    "defaultLimit": 20
  },
  "export": {
    "defaultDirectory": "~/Downloads",
    "defaultFormat": "json"
  },
  "display": {
    "colors": true,
    "boxWidth": 55,
    "cardWidth": 70,
    "truncateLength": 40
  },
  "scoring": {
    "highThreshold": 0.7,
    "midThreshold": 0.4
  },
  "hooks": {
    "enabled": true,
    "complexityThreshold": 5,
    "permissions": { ... },
    "sensitiveFiles": { ... },
    "preCompact": { ... },
    "packageAuditor": { ... },
    "cursedFiles": { ... },
    "promptAnalysis": { ... },
    "stop": { ... }
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
- Edit `src/tools/validation.ts` for input validation
- Edit `src/hooks/*.ts` to customize hook behavior
- Edit `src/config/index.ts` for default settings
- Edit `hooks/hooks.json` to enable/disable hooks

4. Build & Test:
```bash
bun run build
bun test
bun run lint
```

5. Test locally:
```bash
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
| Add tool validation | `src/tools/validation.ts` | TypeBox input validation |
| Modify recall scoring | `src/tools/recall.ts` | Change similarity thresholds |
| Add language support | `src/indexer/languages/` | Add tree-sitter grammar |
| Change hook behavior | `src/hooks/*.ts` | Modify automatic actions |
| Disable a hook | `hooks/hooks.json` | Remove hook entry |
| Change defaults | `src/config/index.ts` | Modify DEFAULT_CONFIG |
| Add new config option | `src/config/index.ts` | Add to interface and defaults |

### Adding a New Hook

1. Create `src/hooks/your-hook.ts`:
```typescript
import { getConfig } from '../config/index.js';

export async function yourHook(input: any): Promise<{ continue: boolean; message?: string }> {
  const config = getConfig();
  // Your logic here
  return { continue: true };
}
```

2. Register in `src/hooks/index.ts`

3. Add to `hooks/hooks.json`:
```json
{
  "hooks": [
    {
      "matcher": "YourTrigger",
      "hooks": [{
        "type": "command",
        "command": "bun run hooks/your-hook.ts"
      }]
    }
  ]
}
```

### Adding a New Language

1. Create `src/indexer/languages/yourlang.ts`:
```typescript
import { LanguageParser } from './base.js';
import type { ParseResult } from '../types.js';

export class YourLangParser extends LanguageParser {
  parse(filePath: string, content: string): ParseResult {
    // Extract symbols and imports using tree-sitter
  }
}
```

2. Register in `src/indexer/languages/index.ts`

3. Add grammar URL to `src/indexer/parser.ts`

---

## API Integrations

| Service | Purpose | Used By |
|---------|---------|---------|
| OSV.dev | CVE database | Package auditing |
| npm registry | Package metadata | Deprecation check |
| Bundlephobia | Bundle size | Size warnings |
| GitHub API | Repo cloning | Repomix |
| Context7 | Library docs | Auto-redirect from WebFetch |

---

## Performance Optimizations

### Token Savings
- Compact JSON output (~10-15% reduction)
- Two-phase Repomix (index free, pack on confirm)
- Haiku-delegable tools for simple operations (13 tools)

### MCP Annotations
All 18 tools have official hints:
- `readOnlyHint` - No side effects (11 tools)
- `idempotentHint` - Safe to retry (6 tools)
- `destructiveHint` - Deletes data (1 tool)
- `openWorldHint` - External API calls (1 tool)

### MCP Server Instructions
Surfaced to LLM via `_meta.instructions`:
- Prefer Matrix index tools over grep/bash
- Prefer Context7 over WebFetch/WebSearch for docs
- Delegation guidance for subagents

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
| `/matrix:doctor` | `commands/doctor.md` |

---

## Data Locations

```
~/.claude/matrix/
├── matrix.db              # SQLite database (all data)
├── matrix.config          # Configuration file (auto-created)
├── models/                # Embedding model cache (~23MB)
├── grammars/              # Tree-sitter WASM files (~1-2MB each)
├── repomix-cache/         # Cached repo packs
├── session-analysis.jsonl # PreCompact session logs
└── .initialized           # Version marker
```

---

## Diagnostics (matrix_doctor)

Checks performed:
1. **Directory** - ~/.claude/matrix/ exists and writable
2. **Database** - matrix.db exists, not corrupted, schema valid
3. **Config** - matrix.config parseable, valid structure
4. **Hooks** - hooks.json valid, scripts executable
5. **Code Index** - Repository detected, index populated
6. **Repo Detection** - Project files found (package.json, go.mod, etc.)

Auto-fixes (data-safe):
- Create missing directories
- Run schema migrations
- Reset corrupted config (NOT database)
- Rebuild code index

**Never auto-fixed** (requires user action):
- Corrupted database (preserves user data)

---

## License

MIT - Fork freely, customize as needed.
