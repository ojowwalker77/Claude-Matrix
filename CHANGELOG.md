# Changelog

All notable changes to Claude Matrix are documented here.

## [0.5.5] - 2025-12-25

### Added
- **Prompt Agent** (`matrix_prompt`) - Meta-agent that analyzes prompts before execution
  - Detects ambiguity (scope, target, approach, action)
  - Calculates confidence score (0-100%)
  - Recognizes shortcuts: "yolo", "ship it", "nah", "abort", etc.
  - Injects context from CLAUDE.md, git, and Matrix memory
  - Returns optimized prompt or asks clarification questions

### Fixed
- **Plugin Setup Script** - Added `"setup": "bun install"` to plugin.json
  - Fixes "sharp module not found" error on fresh installs
  - Dependencies now auto-install when plugin is installed

## [0.5.4] - 2025-12-25

### Breaking Changes
- **Plugin-Only Distribution** - Matrix is now a pure Claude Code plugin
  - Install via `/plugin install matrix@ojowwalker77`
  - Removed CLI (`matrix` command no longer exists)
  - Removed Cursor support
  - Removed `install.sh`

### Added
- **Plugin Structure** - Full Claude Code plugin architecture
  - `.claude-plugin/plugin.json` manifest
  - `.mcp.json` with Matrix + Context7 MCP servers
  - `hooks/hooks.json` for automatic hook registration
  - 6 slash commands: `/matrix:search`, `/matrix:list`, `/matrix:stats`, `/matrix:warn`, `/matrix:export`, `/matrix:verify`
- **Compiled Binaries** - Cross-platform executables (no runtime dependency)
  - macOS ARM64, macOS x64, Linux x64, Linux ARM64
  - Build via `bun run build` or `bun run build:all`
- **SessionStart Hook** - Automatic first-run initialization
  - Creates `~/.claude/matrix/` directory
  - Initializes SQLite database
  - Migrates existing installations
- **GitHub Actions** - CI workflow for cross-platform releases

### Changed
- Database location standardized to `~/.claude/matrix/matrix.db`
- Embedding models cached at `~/.claude/matrix/models/`
- Context7 bundled as second MCP server (auto-available)

### Removed
- CLI commands (replaced by MCP tools + slash commands)
- Cursor support (templates/.cursorrules, cursor-mcp.json)
- install.sh (replaced by plugin system)
- Homebrew distribution (plugin-only now)

## [0.5.3] - 2025-12-25

### Added
- **Context7** - WebFetch/WebSearch intercepted via hooks, defaults to Context7 for library docs
  - `matrix context7` commands: install, status, uninstall, test
  - `matrix init` auto-installs Context7 MCP

## [0.5.2] - 2025-12-24

### Improved
- **Hardened install.sh** - More reliable first-run experience
  - Auto-retry for git clone (3 attempts with backoff)
  - Check for required dependencies (curl, git) upfront
  - Create `~/.local/bin` if missing for CLI symlink
  - Warn if `~/.local/bin` not in PATH with fix instructions
  - Skip interactive prompts when piped (non-interactive mode)
  - Add `MATRIX_FORCE=1` env var to force reinstall
  - 3-tier fallback for `bun install` failures (normal → ignore-scripts → production)

## [0.5.1] - 2025-12-23

### Fixed
- **Homebrew Installation** - Install script now runs `bun install` after `brew install`
  - Fixes ENOENT errors for `@xenova/transformers` and `sharp` packages
  - Homebrew formula tarball doesn't include `node_modules`, this adds the missing step

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
