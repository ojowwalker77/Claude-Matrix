# Repo Fingerprinting

Matrix automatically detects your project's tech stack and uses it to boost relevance of solutions from similar projects.

## How It Works

When you call `matrix_recall` or `matrix_store`, Matrix:

1. Finds the git root (or uses current directory)
2. Scans for project configuration files
3. Extracts languages, frameworks, dependencies, patterns
4. Generates an embedding from this fingerprint
5. Stores/retrieves the repo from the database

## Supported Project Types

### Node.js / Bun (package.json)

```json
{
  "name": "my-app",
  "dependencies": {
    "react": "^18.0.0",
    "express": "^4.18.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "jest": "^29.0.0"
  }
}
```

**Detected:**
- Languages: `typescript` (if tsconfig.json exists or typescript in devDeps)
- Frameworks: `react`, `express`
- Test framework: `jest`
- Dependencies: Top 20 from dependencies

### Rust (Cargo.toml)

```toml
[package]
name = "my-api"

[dependencies]
actix-web = "4"
tokio = { version = "1", features = ["full"] }
```

**Detected:**
- Languages: `rust`
- Frameworks: `actix`
- Test framework: `cargo-test`
- Dependencies: All from [dependencies]

### Python (pyproject.toml / requirements.txt)

```toml
[project]
name = "my-api"
dependencies = [
    "fastapi>=0.100.0",
    "sqlalchemy>=2.0.0",
]

[project.optional-dependencies]
dev = ["pytest", "black"]
```

**Detected:**
- Languages: `python`
- Frameworks: `fastapi`
- Test framework: `pytest`
- Dependencies: From dependencies array

### Go (go.mod)

```go
module github.com/user/my-api

require (
    github.com/gin-gonic/gin v1.9.0
    github.com/lib/pq v1.10.0
)
```

**Detected:**
- Languages: `go`
- Frameworks: `gin`
- Test framework: `go-test`
- Dependencies: All require statements

## Framework Detection

Matrix recognizes common frameworks by dependency names:

| Framework | Detected From |
|-----------|---------------|
| React | `react`, `react-dom`, `next`, `@remix-run/react`, `gatsby` |
| Vue | `vue`, `nuxt`, `@vue/cli` |
| Angular | `@angular/core` |
| Svelte | `svelte`, `@sveltejs/kit` |
| Express | `express` |
| Fastify | `fastify` |
| Hono | `hono` |
| NestJS | `@nestjs/core` |
| FastAPI | `fastapi` |
| Django | `django` |
| Flask | `flask` |
| Actix | `actix-web` |
| Axum | `axum` |
| Gin | `github.com/gin-gonic/gin` |
| Echo | `github.com/labstack/echo` |

## Pattern Detection

Matrix also detects project patterns:

| Pattern | Detected From |
|---------|---------------|
| `monorepo` | `pnpm-workspace.yaml`, `lerna.json`, `nx.json` |
| `api` | Web framework detected (express, fastapi, gin, etc.) |
| `cli` | CLI libraries (`commander`, `yargs`, `clap`, `cobra`, etc.) |
| `library` | `tsconfig.build.json`, `tsup`, `rollup` |

## Context Boost

During `matrix_recall`, solutions get boosted based on repo similarity:

### Same Repo (+15%)

If the solution was stored from the same git repository (matched by path), its similarity score is multiplied by 1.15.

```
Original similarity: 0.80
Boosted similarity: 0.80 × 1.15 = 0.92
```

### Similar Stack (+8%)

If the solution is from a different repo but with similar tech stack (>70% fingerprint embedding similarity), its similarity is multiplied by 1.08.

```
Original similarity: 0.75
Stack similarity: 0.85 (> 0.70 threshold)
Boosted similarity: 0.75 × 1.08 = 0.81
```

## Fingerprint Text

The fingerprint is converted to text for embedding:

```
project: my-api | languages: typescript, python | frameworks: express, fastapi | patterns: api, monorepo | dependencies: lodash, axios, ...
```

This text is embedded using the same model as solution problems (all-MiniLM-L6-v2).

## Database Schema

Repos are stored in the `repos` table:

```sql
CREATE TABLE repos (
    id TEXT PRIMARY KEY,              -- repo_xxxxxxxx
    name TEXT NOT NULL,               -- Project name
    path TEXT,                        -- Git root path (unique identifier)
    languages JSON DEFAULT '[]',      -- ["typescript", "python"]
    frameworks JSON DEFAULT '[]',     -- ["react", "express"]
    dependencies JSON DEFAULT '[]',   -- ["lodash", "axios", ...]
    patterns JSON DEFAULT '[]',       -- ["api", "monorepo"]
    test_framework TEXT,              -- jest | pytest | cargo-test | go-test
    fingerprint_embedding BLOB,       -- 384-dim Float32Array
    created_at TEXT,
    updated_at TEXT
);
```

## API

### fingerprintRepo(path?: string): DetectedRepo

Detects the repo at the given path (defaults to cwd).

```typescript
interface DetectedRepo {
  root: string;           // Git root or cwd
  name: string;           // Project name
  languages: string[];    // ["typescript"]
  frameworks: string[];   // ["react", "express"]
  dependencies: string[]; // Top 30 deps
  patterns: string[];     // ["api", "monorepo"]
  testFramework: string | null;
}
```

### getOrCreateRepo(detected: DetectedRepo): Promise<string>

Stores or updates the repo in the database, returns repo ID.

### getRepoEmbedding(repoId: string): Float32Array | null

Gets the fingerprint embedding for a repo.

## Examples

### Matrix Project Fingerprint

```typescript
const fp = fingerprintRepo();
// {
//   root: "/Users/jow/.claude/matrix",
//   name: "claude-matrix",
//   languages: ["typescript"],
//   frameworks: [],
//   dependencies: ["@modelcontextprotocol/sdk", "@xenova/transformers"],
//   patterns: [],
//   testFramework: "bun"
// }
```

### React + Express Project

```typescript
const fp = fingerprintRepo("/path/to/fullstack-app");
// {
//   root: "/path/to/fullstack-app",
//   name: "fullstack-app",
//   languages: ["typescript"],
//   frameworks: ["react", "express"],
//   dependencies: ["react", "express", "axios", ...],
//   patterns: ["api"],
//   testFramework: "jest"
// }
```
