# Changelog

All notable changes to Claude Matrix are documented here.

## [1.1.1] - 2025-12-31

### Added

- **TypeBox Validation** - Runtime input validation with `@sinclair/typebox`
- **Tool Search Config** - `toolSearch.enabled`, `preferMatrixIndex`, `preferContext7` options

## [1.1.0] - 2025-12-30

### Added

- **10 New Languages** - Java, Kotlin, Swift, C#, Ruby, PHP, C, C++, Elixir, Zig
- **15 Languages Total** - Full symbol indexing across all major ecosystems

## [1.0.10] - 2025-12-30

### Fixed

- **repoPath parameter not passed through** - Handler was ignoring `repoPath` on all 6 index tools
  - `matrix_reindex`, `matrix_find_definition`, `matrix_search_symbols`, `matrix_list_exports`, `matrix_get_imports`, `matrix_index_status` now correctly pass `repoPath` to underlying functions
  - Without this fix, MCP server always used its own cwd (plugin cache dir) instead of user's project

## [1.0.9] - 2025-12-30

### Added

- **Path-Based Indexing** - Index any repository from any location
  - New `repoPath` parameter on all 6 index tools (`matrix_reindex`, `matrix_find_definition`, `matrix_search_symbols`, `matrix_list_exports`, `matrix_get_imports`, `matrix_index_status`)
  - Supports absolute paths, relative paths (auto-resolved), and defaults to cwd
  - Extended project detection: TypeScript/JavaScript, Python, Go, Rust

### Improved

- **Enhanced MCP Instructions** - Better tool usage guidance for Claude
  - Prefer Matrix index tools over grep/bash for code searches
  - Prefer Context7 over WebFetch/WebSearch for library docs
  - Subagent instructions: Tell agents to use index tools and Context7

## [1.0.8] - 2025-12-29

### Optimizations

- **Expanded Haiku Delegation** - 13 tools now delegable (up from 8)
  - Added: `matrix_recall`, `matrix_find_definition`, `matrix_search_symbols`, `matrix_list_exports`, `matrix_get_imports`
  - These are read-only data extraction tools - Haiku passes params, server does the work
  - **MCP Server Instructions** - Delegation list now surfaced to LLM via official MCP mechanism
  - Non-delegable (require Opus reasoning): `matrix_store`, `matrix_failure`, `matrix_prompt`, `matrix_repomix`

## [1.0.7] - 2025-12-28

### Optimizations

- **Haiku Sub-Agent Delegation** - 8 low-complexity tools marked as delegable
  - `_meta.delegable: true` for: matrix_status, matrix_index_status, matrix_reindex, matrix_reward, matrix_warn_check, matrix_warn_add, matrix_warn_remove, matrix_warn_list
  - Enables routing simple CRUD operations to Haiku for cost savings

- **MCP Annotations** - Official hints added to all 17 tools
  - `readOnlyHint: true` for 10 query-only tools
  - `idempotentHint: true` for 6 safe-to-retry tools
  - `destructiveHint: true` for matrix_warn_remove
  - `openWorldHint: true` for matrix_repomix (GitHub API)

- **Compact JSON Output** - 10-15% token reduction on all tool responses
  - Switched from pretty-printed to compact JSON in handlers

- **Safe Description Trims** - Removed redundancy, kept guidance
  - Trimmed obvious/redundant text from tool descriptions
  - Preserved "Use when...", examples, and enum explanations

## [1.0.6] - 2025-12-28

### Added

- **Repomix Integration** - Pack external repositories with minimal token consumption
  - Two-phase flow: Index (no tokens) → Confirm → Pack (tokens)
  - Query-first semantic search using Matrix embeddings
  - Token estimates shown BEFORE consumption
  - Smart exclusions (tests, docs, configs, node_modules)
  - New `matrix_repomix` tool with GitHub shorthand support
  - 24h cache for index, configurable TTL for pack results

## [1.0.5] - 2025-12-28

### Fixed

- **Database Migration** - Fixed "no such column: category" error for existing v2 databases (#46)
  - `getDb()` now calls `runMigrations()` to properly upgrade schema before use
  - Added `schemaVersion` to `/matrix:status` for easier debugging

## [1.0.3] - 2025-12-27

### Fixes

- **Verify Command**: Fixed hooks detection - hooks are plugin-scoped via `hooks/hooks.json`, not settings.json
- **Auto-Migration**: Schema migrations now run automatically on version upgrade
- **Plugin Manifest**: Added `hooks` field reference to plugin.json
## [1.0.2] - 2025-12-27

### Multi-Language Code Index

- **Tree-sitter Parser**: Replaced TypeScript Compiler API with tree-sitter WASM for multi-language support
- **10 Languages Supported**: TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, Ruby, PHP
- **Lazy Grammar Loading**: Grammars downloaded on first use (~1-2MB each), cached in `~/.claude/matrix/grammars/`
- **Zero Overhead**: No bundled WASM files, grammars fetched from unpkg.com when needed
- **Project Detection**: Auto-indexes Python (pyproject.toml), Go (go.mod), Rust (Cargo.toml), Java (pom.xml), Ruby (Gemfile), PHP (composer.json), C/C++ (CMakeLists.txt)

---

## [1.0.1] - 2025-12-27

### Enhanced Memory System

- **New `matrix_store` fields**: `category`, `complexity`, `prerequisites`, `antiPatterns`, `codeBlocks`, `relatedSolutions`, `supersedes`
- **New `matrix_recall` filters**: `categoryFilter`, `maxComplexity`
- **Auto-complexity**: Solutions get complexity 1-10 calculated automatically
- **Solution evolution**: Track when solutions replace older ones via `supersedes`
- **Schema migration**: v2 → v3 runs automatically

---

## [1.0.0] - 2025-12-25

### Major Release - "Claude on Rails"

First stable release of Claude Matrix with complete memory system, intelligent hooks, and code navigation.

### Core Features

**Memory System**
- `matrix_recall` - Semantic search for solutions with context-aware scoring
- `matrix_store` - Save solutions with local embeddings (transformers.js)
- `matrix_reward` - Feedback system improves rankings over time
- `matrix_failure` - Record errors and fixes for future prevention
- `matrix_status` - Memory statistics and health check

**Warning System**
- `matrix_warn_check` - Check files/packages for warnings before use
- `matrix_warn_add` - Mark problematic dependencies or cursed files
- `matrix_warn_remove` - Remove warnings by ID or target
- `matrix_warn_list` - List all active warnings

**Code Index** (TypeScript/JavaScript)
- `matrix_find_definition` - Find where symbols are defined
- `matrix_search_symbols` - Search by partial name match
- `matrix_list_exports` - List exports from file/directory
- `matrix_get_imports` - Get imports for a file
- `matrix_index_status` - Index health and statistics
- `matrix_reindex` - Manually trigger reindexing

**Hooks (Automatic)**
- `SessionStart` - Initialize database, index codebase
- `UserPromptSubmit` - Prompt analysis, complexity check, memory injection, code navigation detection
- `PreToolUse:Bash` - Package auditing (CVEs, deprecation, size)
- `PreToolUse:Edit` - Warn about problematic files
- `PreToolUse:WebFetch|WebSearch` - Intercept library docs → Context7
- `PostToolUse:Bash` - Log package installations
- `Stop` - Session analysis, prompt to save solutions

**Prompt Agent**
- Shortcut detection: "yolo", "ship it", "nah", "abort"
- Ambiguity analysis with confidence scoring
- Context injection from CLAUDE.md, git, and Matrix memory

**Context7 Integration**
- Bundled as second MCP server
- Auto-intercepts library documentation queries
- 100+ frameworks/libraries supported

### Slash Commands
- `/matrix:search` - Search for solutions
- `/matrix:list` - List stored solutions
- `/matrix:stats` - Show memory statistics
- `/matrix:warn` - Manage warnings
- `/matrix:export` - Export database
- `/matrix:verify` - Check installation health
- `/matrix:reindex` - Manually reindex repository

### Configuration
- `~/.claude/matrix.config` for all settings
- Indexing: enabled, excludePatterns, maxFileSize, timeout, includeTests
- Hooks: enabled, complexityThreshold, caching options
- Display: colors, box widths, truncation

---

## [0.5.5] - 2025-12-25

### Added
- **Prompt Agent** (`matrix_prompt`) - Meta-agent that analyzes prompts before execution

### Fixed
- **Plugin Setup Script** - Added `"setup": "bun install"` to plugin.json

## [0.5.4] - 2025-12-25

### Breaking Changes
- **Plugin-Only Distribution** - Matrix is now a pure Claude Code plugin
  - Install via `/plugin marketplace add ojowwalker77/Claude-Matrix`
  - Removed CLI (`matrix` command no longer exists)
  - Removed Cursor support

### Added
- **Plugin Structure** - Full Claude Code plugin architecture
- **Compiled Binaries** - Cross-platform executables
- **SessionStart Hook** - Automatic first-run initialization
- **GitHub Actions** - CI workflow for releases

## [0.5.3] - 2025-12-25

### Added
- **Context7** - WebFetch/WebSearch intercepted via hooks

## [0.5.2] - 2025-12-24

### Improved
- **Hardened install.sh** - More reliable first-run experience

## [0.5.1] - 2025-12-23

### Fixed
- **Homebrew Installation** - Fixes ENOENT errors for packages

## [0.5.0] - 2025-12-23

### Added
- **Claude Code Hooks Integration** - 5 hooks for automatic Matrix memory integration
- **Warning System** - Track problematic files and packages
- **Complexity Estimation** - Pattern-based complexity scoring (1-10)
- **Styled Terminal Output** - Box-formatted status display

## [0.4.x] - 2025-12-22

- Edit command for solutions/failures
- Export saves to file with timestamps
- Cursor IDE support
- Auto PATH setup

## [0.3.0] - 2024-12-17

- **CLI Tool** - Full command-line interface
- **Homebrew Distribution** - Easy installation
- **Shell Completions** - Tab completion for bash, zsh, fish

## [0.2.0] - 2024-12-17

- **Repo Fingerprinting** - Automatic detection of project type
- **Context-Aware Recall** - Solutions from same repo/stack boosted
- **Database Indexes** - Better query performance

## [0.1.0] - 2024-12-16

- Initial public release
- 5 MCP Tools (recall, store, reward, failure, status)
- Local Embeddings (transformers.js)
- SQLite Storage
- Reward System
