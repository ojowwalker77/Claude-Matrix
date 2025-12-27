# Changelog

All notable changes to Claude Matrix are documented here.

## [1.0.4] - 2025-12-27

### Repomix Integration

- **New `matrix_repomix` tool**: Pack external repositories into AI-friendly context
  - GitHub shorthand support (e.g., `langchain-ai/langchain`)
  - Local path support for local directories
  - Branch/commit selection
  - Glob patterns for file filtering
  - Compression mode (function signatures only)
  - Automatic caching (1 hour TTL)
  - Token limiting with intelligent truncation

- **New `/matrix:repomix` slash command**: Quick access to repo packing
- **Complementary to Context7**: Context7 for docs, Repomix for source code

### Use Cases
- Analyze how external libraries implement features
- Study patterns and architecture in open source projects
- Get full codebase context for detailed questions

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
