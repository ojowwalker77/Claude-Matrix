# Changelog

All notable changes to Claude Matrix are documented here.

## [0.5.0] - 2025-12-23

### Added
- **Claude Code Hooks Integration** - 5 hooks for automatic Matrix memory integration
  - `UserPromptSubmit` - Estimates complexity, injects relevant solutions before Claude responds
  - `PreToolUse:Bash` - Package auditor (CVEs via OSV.dev, deprecation, bundle size, local warnings)
  - `PreToolUse:Edit` - Cursed file detection (warns before editing problematic files)
  - `PostToolUse:Bash` - Logs successful package installations for audit trail
  - `Stop` - Analyzes sessions and prompts to store significant solutions

- **Warning System** - Track problematic files and packages
  - `matrix_warn_check` - Check if file/package has warnings
  - `matrix_warn_add` - Add warnings with severity (info/warn/block)
  - `matrix_warn_remove` - Remove warnings by ID or target
  - `matrix_warn_list` - List all warnings
  - Glob pattern support for file warnings (e.g., `src/legacy/*`)
  - Ecosystem support: npm, pip, cargo, go

- **Complexity Estimation** - Pattern-based complexity scoring (1-10)
  - Detects: implementation tasks, external integrations, multi-file changes
  - Configurable threshold for memory injection (default: 5)

- **Styled Terminal Output** - Box-formatted status display for hooks
  - Complexity score with color coding (green/cyan/yellow)
  - Solution/error count display
  - Attempts TTY output, falls back to stderr

### Known Issues
- Hook output visibility is limited in Claude Code terminal
  - Workaround: Enable verbose mode with Ctrl+O
  - Related issues:
    - [#4084](https://github.com/anthropics/claude-code/issues/4084) - Hook output visibility blocked
    - [#10964](https://github.com/anthropics/claude-code/issues/10964) - UserPromptSubmit stderr not displayed
    - [#11120](https://github.com/anthropics/claude-code/issues/11120) - Startup hook stdout not displayed
    - [#12653](https://github.com/anthropics/claude-code/issues/12653) - SessionStart stderr not displaying

### Changed
- `matrix init` now configures Claude Code hooks automatically
- Database schema extended with `warnings` and `dependency_installs` tables

## [0.4.4] - 2025-12-22

### Added
- **Edit Command** - `matrix edit <id>` to edit solutions and failures
  - Interactive mode: select fields to edit with numbered menu
  - Inline mode: `--field=problem --value="New value"`
  - Auto-detects solution vs failure, or use `--type=failure`

## [0.4.3] - 2025-12-22

### Fixed
- **Export saves to file** - `matrix export` now saves to Downloads folder by default
  - Configurable via `matrix config set export.defaultDirectory /path`
  - Generates timestamped filenames: `matrix-export-{type}-{timestamp}.json`

## [0.4.2] - 2025-12-22

### Added
- **Cursor Support** - `matrix init` now supports Cursor IDE
  - Interactive prompt to choose: Claude Code, Cursor, or Both
  - Cursor: Configures `~/.cursor/mcp.json` and `~/.cursorrules`
  - Both editors share the same Matrix database

## [0.4.1] - 2025-12-21

### Added
- **Auto PATH Setup** - `matrix init` now configures PATH automatically
  - Adds `~/.claude/matrix/bin` to shell config (`.zshrc`, `.bashrc`, `.bash_profile`)
  - Detects existing PATH config to avoid duplicates
  - `--skip-path` flag to opt out
  - Manual installations now get same CLI experience as Homebrew

## [0.4.0] - 2024-12-20

### Added
- **Interactive Onboarding** - `matrix follow the white rabbit`
  - Matrix-themed terminal game for onboarding
  - Learn all 6 features: SEARCH, STORE, RECALL, REWARD, FAILURE, STATS
- **Config Command** - `matrix config`
  - View and edit settings: `list`, `get <key>`, `set <key> <val>`, `reset`
  - Configurable defaults for search, list, merge, and display
- **Merge Command** - `matrix merge`
  - Find and merge duplicate solutions/failures
  - Options: `--threshold`, `--type`, `--dry-run`

### Changed
- Search, List, Merge commands now use configurable defaults
- Help command updated with new commands and examples

## [0.3.1] - 2024-12-19

### Added
- **Duplicate Detection** - Prevents storing the same solution twice (>90% similarity check)
- **Embedding Validation** - Gracefully skips corrupted database entries instead of crashing

### Fixed
- **Similarity Overflow** - Context-boosted scores now capped at 0.99
- **Race Condition** - Fixed edge case in duplicate detection
- **TypeScript Errors** - Fixed strict mode issues in CLI

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
