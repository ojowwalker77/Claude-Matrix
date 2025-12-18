# Changelog

All notable changes to Claude Matrix are documented here.

## [0.3.0] - 2024-12-17

### Added
- **CLI Tool** - Full command-line interface for Matrix
  - `matrix init` - Auto-setup for non-technical users (installs deps, registers MCP, sets up CLAUDE.md)
  - `matrix search <query>` - Semantic search with `--limit`, `--min-score`, `--scope` options
  - `matrix list [solutions|failures|repos]` - Paginated listing with `--page`, `--limit`
  - `matrix stats` - Memory statistics with current repo info
  - `matrix export` - Database export with `--format=json|csv`, `--output`, `--type`
  - `matrix version` / `matrix help` - Version and usage info
- **Homebrew Distribution** - Easy installation via Homebrew tap
  - `brew tap ojowwalker77/matrix && brew install matrix`
  - Auto-installs Bun dependency
  - Post-install instructions for `matrix init`
- **Shell Completions** - Tab completion for bash, zsh, and fish
- **Shell Wrapper** - `bin/matrix` script with Bun detection and error handling

### Changed
- Version bump to 0.3.0
- Updated README with CLI documentation and Homebrew instructions
- Added `bin` entry to package.json
- Added `cli` script to package.json

## [0.2.0] - 2024-12-17

### Added
- **Repo Fingerprinting** - Automatic detection of project type and tech stack
  - Supports: package.json (Node/Bun), Cargo.toml (Rust), pyproject.toml (Python), go.mod (Go)
  - Detects languages, frameworks, dependencies, and patterns
  - Generates embeddings for stack similarity matching
- **Context-Aware Recall** - Solutions from same repo or similar stack get boosted relevance
  - Same repo: +15% similarity boost
  - Similar stack (>70% fingerprint similarity): +8% boost
- **Repo Info in Status** - `matrix_status` now shows current repo name, languages, frameworks, patterns
- **Database Indexes** - Added 4 new indexes for better query performance
  - `idx_solutions_scope_score` - Compound index for scope-filtered queries
  - `idx_solutions_created` - Recent solutions queries
  - `idx_failures_type` - Filter by error type
  - `idx_usage_created` - Time-based usage queries

### Changed
- `matrix_store` now automatically attaches `repo_id` to solutions
- `matrix_recall` includes `contextBoost` field in results (`same_repo` | `similar_stack`)

## [0.1.1] - 2024-12-17

### Added
- **Unit Tests** - 45 tests using `bun:test`
  - Tests for all tools (store, recall, reward, failure, status)
  - Tests for cosineSimilarity function
  - Tests for repo fingerprinting
- **Modular Architecture** - Restructured codebase for maintainability
  - `src/server/` - MCP server handlers
  - `src/tools/` - Tool implementations with barrel exports
  - `src/db/` - Database client with barrel exports
  - `src/embeddings/` - Embedding functions with barrel exports
  - `src/types/` - Consolidated TypeScript types
  - `src/repo/` - Repository fingerprinting
- **Type Definitions** - Added `@types/bun` for better TypeScript support

### Fixed
- SQL safety in `recall.ts` - Now uses parameterized queries

### Changed
- Slimmed down `src/index.ts` from 294 to 50 lines
- Consolidated duplicate `cosineSimilarity` function into single location
- Extracted tool schemas to `src/tools/schemas.ts`
- Extracted `matrix_status` logic to `src/tools/status.ts`

## [0.1.0] - 2024-12-16

### Added
- Initial public release
- **5 MCP Tools**:
  - `matrix_recall` - Semantic search for solutions
  - `matrix_store` - Save solutions with embeddings
  - `matrix_reward` - Feedback system for scoring
  - `matrix_failure` - Error pattern recording
  - `matrix_status` - Memory statistics
- **Local Embeddings** - 100% offline using `@xenova/transformers`
- **SQLite Storage** - Single portable database file
- **Reward System** - Solutions ranked by success rate
- **Error Deduplication** - Signature-based matching for failures
- **Scope System** - Solutions tagged as global/stack/repo
