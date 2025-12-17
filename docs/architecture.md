# Architecture

This document explains the internal architecture of Claude Matrix.

## Overview

Matrix is an MCP (Model Context Protocol) server that provides persistent memory capabilities to Claude Code through 5 tools:

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code                              │
│                         │                                    │
│                    MCP Protocol                              │
│                         │                                    │
│  ┌──────────────────────▼──────────────────────────────────┐│
│  │                  Matrix Server                           ││
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       ││
│  │  │ recall  │ │ store   │ │ reward  │ │ failure │ ...   ││
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘       ││
│  │       │           │           │           │             ││
│  │  ┌────▼───────────▼───────────▼───────────▼────┐       ││
│  │  │              Embeddings Layer                │       ││
│  │  │         (Xenova Transformers)               │       ││
│  │  └─────────────────────┬───────────────────────┘       ││
│  │                        │                                ││
│  │  ┌─────────────────────▼───────────────────────┐       ││
│  │  │              SQLite Database                 │       ││
│  │  │    solutions | failures | repos | usage_log │       ││
│  │  └─────────────────────────────────────────────┘       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── index.ts              # MCP server entry point (~50 lines)
├── server/
│   ├── index.ts          # Barrel export
│   └── handlers.ts       # Tool call dispatcher
├── tools/
│   ├── index.ts          # Barrel export
│   ├── schemas.ts        # MCP tool schemas (JSON Schema)
│   ├── recall.ts         # Semantic search with context boost
│   ├── store.ts          # Save solutions with repo context
│   ├── reward.ts         # Feedback and score adjustment
│   ├── failure.ts        # Error pattern recording
│   └── status.ts         # Statistics and repo info
├── repo/
│   ├── index.ts          # Barrel export
│   ├── fingerprint.ts    # Project type detection
│   └── store.ts          # Repo persistence
├── db/
│   ├── index.ts          # Barrel export
│   ├── client.ts         # SQLite connection and helpers
│   └── schema.sql        # Database schema
├── embeddings/
│   ├── index.ts          # Barrel export
│   └── local.ts          # Xenova transformer embeddings
├── types/
│   ├── index.ts          # Barrel export
│   ├── tools.ts          # Tool input/output types
│   └── db.ts             # Database row types
└── __tests__/            # Unit tests
```

## Data Flow

### Storing a Solution

```
1. User calls matrix_store(problem, solution, scope, tags)
2. fingerprintRepo() detects current project
3. getOrCreateRepo() stores/updates repo in database
4. getEmbedding() generates 384-dim vector for problem
5. INSERT into solutions table with repo_id
6. Return solution ID
```

### Recalling Solutions

```
1. User calls matrix_recall(query)
2. fingerprintRepo() detects current project
3. getOrCreateRepo() gets current repo ID and embedding
4. getEmbedding() generates query embedding
5. SELECT all solutions with embeddings
6. For each solution:
   a. Calculate cosine similarity
   b. Apply context boost if same repo (+15%) or similar stack (+8%)
   c. Filter by minScore threshold
7. Sort by similarity * score (historical performance)
8. Update usage counts
9. Return top N matches
```

## Key Components

### MCP Server (index.ts)

The entry point is minimal (~50 lines):
- Creates MCP server instance
- Registers tool schemas from `tools/schemas.ts`
- Routes tool calls to `server/handlers.ts`
- Handles graceful shutdown

### Tool Handlers (server/handlers.ts)

Central dispatcher that:
- Initializes database connection
- Routes to appropriate tool function
- Serializes results to JSON
- Handles errors uniformly

### Embeddings (embeddings/local.ts)

Uses `@xenova/transformers` for local embeddings:
- Model: `all-MiniLM-L6-v2` (384 dimensions)
- Quantized for faster loading
- Singleton pattern for model caching
- Text truncated to 2000 chars

### Database (db/client.ts)

SQLite via `bun:sqlite`:
- WAL mode for concurrent reads
- Foreign keys enabled
- Schema auto-initialization
- Embedding stored as BLOB (Float32Array → Buffer)

### Repo Fingerprinting (repo/fingerprint.ts)

Detects project type by parsing:
- `package.json` → Node/Bun/TypeScript
- `Cargo.toml` → Rust
- `pyproject.toml` → Python
- `go.mod` → Go

Extracts: languages, frameworks, dependencies, patterns, test framework

## Database Schema

### solutions
```sql
id TEXT PRIMARY KEY,           -- sol_xxxxxxxx
repo_id TEXT,                  -- FK to repos
problem TEXT NOT NULL,         -- Problem description
problem_embedding BLOB,        -- 384-dim Float32Array
solution TEXT NOT NULL,        -- Solution content
scope TEXT,                    -- global | stack | repo
context JSON,                  -- { filesAffected: [...] }
tags JSON,                     -- ["tag1", "tag2"]
score REAL DEFAULT 0.5,        -- Historical success rate
uses INTEGER DEFAULT 0,        -- Recall count
successes INTEGER DEFAULT 0,   -- Positive feedback count
failures INTEGER DEFAULT 0,    -- Negative feedback count
created_at, updated_at, last_used_at
```

### failures
```sql
id TEXT PRIMARY KEY,           -- fail_xxxxxxxx
error_type TEXT,               -- runtime | build | test | type | other
error_message TEXT,            -- Original error
error_signature TEXT,          -- SHA256 hash for deduplication
error_embedding BLOB,          -- For similarity search
root_cause TEXT,               -- What caused it
fix_applied TEXT,              -- How it was fixed
prevention TEXT,               -- How to avoid it
occurrences INTEGER,           -- Count of duplicates
```

### repos
```sql
id TEXT PRIMARY KEY,           -- repo_xxxxxxxx
name TEXT,                     -- Project name
path TEXT,                     -- Git root path
languages JSON,                -- ["typescript", "python"]
frameworks JSON,               -- ["react", "fastapi"]
dependencies JSON,             -- ["lodash", "axios"]
patterns JSON,                 -- ["api", "monorepo"]
fingerprint_embedding BLOB,    -- For stack similarity
```

## Scoring Algorithm

Final ranking = `similarity * score`

Where:
- `similarity` = cosine_similarity(query_embedding, solution_embedding) × context_boost
- `score` = historical success rate (0.1 to 1.0)

Context boost:
- Same repo: × 1.15
- Similar stack (>70% fingerprint similarity): × 1.08

Score adjustment on feedback:
- Success: `score + 0.1 * (1 - score)` (asymptotic to 1.0)
- Partial: `score + 0.03`
- Failure: `max(0.1, score - 0.15)`

## Performance Considerations

- Vector search is brute-force O(n) - works well for <10k solutions
- Repo embeddings cached in memory during recall
- Model loaded once per session (singleton)
- WAL mode allows concurrent reads
- Indexes on frequently queried columns
