# Changelog

All notable changes to Claude Matrix are documented here.

## [2.1.1] - 2025-01-17

### Added

#### Dreamer - Scheduled Task Automation
- **`matrix_dreamer` Tool** - Schedule and manage automated Claude tasks
  - 7 actions: `add`, `list`, `run`, `remove`, `status`, `logs`, `history`
  - Native OS schedulers: launchd (macOS), crontab (Linux)
  - Execution history tracked in SQLite database

- **Schedule Formats** - Flexible scheduling options
  - Standard cron expressions: `0 9 * * *`
  - Natural language: `every day at 9am`, `weekdays at 10:30am`, `every Monday at 5pm`
  - Presets: `hourly`, `daily-9am`, `weekly-monday`, etc.

- **Git Worktree Mode** - Isolated task execution (optional)
  - Creates branch + worktree before execution
  - Auto-commits and pushes changes on completion
  - Cleans up worktree after successful push
  - Configurable: `basePath`, `branchPrefix`, `remoteName`

- **Task Configuration Options**
  - `timeout`: Execution timeout in seconds (default: 300)
  - `timezone`: IANA timezone or "local"
  - `tags`: Organize tasks with tags
  - `skipPermissions`: Run without permission prompts (opt-in)
  - `env`: Custom environment variables

#### New Skills
- **`/scheduler:schedule-add`** - Create scheduled tasks interactively
- **`/scheduler:schedule-list`** - View all scheduled tasks
- **`/scheduler:schedule-run`** - Manually trigger a task
- **`/scheduler:schedule-remove`** - Delete a scheduled task
- **`/scheduler:schedule-status`** - Check scheduler health
- **`/scheduler:schedule-logs`** - View task output logs
- **`/scheduler:schedule-history`** - View execution history

### Database Schema

- **v5 Migration** - Added Dreamer tables
  - `dreamer_tasks`: Scheduled task definitions
  - `dreamer_executions`: Execution history records
  - Indexes for efficient querying by repo, status, and time

### Dependencies

- Added `croner` (^8.1.2) - Cron expression parsing and validation
- Added `cronstrue` (^2.52.0) - Human-readable cron descriptions

---

## [2.0.3] - 2025-01-13

### Added

#### Background Job System
- **Async Reindex** - Run `matrix_reindex` with `async: true` to avoid timeouts
  - Returns `jobId` immediately for long-running operations
  - Poll progress with `matrix_job_status`
  - Cancel with `matrix_job_cancel`
  - List all jobs with `matrix_job_list`

#### One-Time Hook Execution
- **once:true Support** - Hooks can now run only once per session
  - `hasRunThisSession(hookName, sessionId)` - Check if already executed
  - `markAsRun(hookName, sessionId)` - Mark hook as complete
  - Database-backed tracking in `hook_executions` table
  - Auto-cleanup of old records (7 days)

### Changed

#### Commands Migrated to Skills
- **Hot-Reload Support** - All 10 Matrix commands now use the new skills format
  - Skills auto-discovered from `skills/` directory
  - Edit skills without restarting Claude Code
  - Progressive disclosure with `references/` for complex skills

- **Model Delegation** - Intelligent agent assignment for cost optimization
  - Default (opus) for complex operations: repomix, create-skill, deep-research, review
  - `agent: haiku` for simple operations: doctor, reindex, list, export, warn, skill-candidates
  - Estimated ~40-50% cost reduction for simple operations

- **Context Isolation** - Fork mode for unbiased analysis
  - `context: fork` for review and deep-research skills
  - Fresh execution environment prevents prior conversation bias
  - Matches recommendation: "run in fresh session for unbiased perspective"

- **Tool Permissions** - Explicit `allowed-tools` for security
  - Each skill declares exactly which MCP tools it needs
  - Wildcard support: `mcp__plugin_matrix_matrix__*`
  - Prevents unintended tool access

### Removed

- **Commands Directory** - Deleted `commands/` in favor of `skills/`
  - All functionality preserved in new skills format
  - Old `/matrix:*` invocation still works via skill triggers

---

## [2.0.2] - 2025-01-13

### Added

#### Subagent Hooks
- **New `SubagentStart` Hook** - Inject Matrix guidance when subagents spawn
  - Fires when Explore, Plan, or other subagents start
  - Injects guidance to prefer Matrix index tools over Grep for code search
  - Injects guidance to prefer Context7 over WebSearch for library docs
  - Respects `toolSearch.preferMatrixIndex` and `toolSearch.preferContext7` config
  - Verbosity-aware output (full/compact/minimal)
  - Agent-specific hints for explore/plan agents to use `matrix_recall`

- **New `SubagentStop` Hook** - Track subagent completion
  - Fires when Explore, Plan, or other subagents complete
  - Logs completion in verbose mode

#### Token Optimization
- **Reduced MCP Tool Token Usage** - ~10-12% reduction in Matrix tool definitions
  - Shortened parameter descriptions across all schemas
  - Removed redundant "Optional:", "default:" phrases
  - Optimized tool description verbosity

#### Index Tools Accessibility
- **Index Tools Always Available** - Can now use from any directory
  - Changed visibility from `'indexable'` → `'always'` for query tools
  - Pass `repoPath` parameter to query any indexed repository
  - Tools: `matrix_find_definition`, `matrix_find_callers`, `matrix_list_exports`, `matrix_search_symbols`, `matrix_get_imports`

#### Auto-Install Features
- **File Suggestion Script** - Auto-installs `~/.claude/file-suggestion.sh`
  - Uses ripgrep + fzf for fast fuzzy file matching
  - Follows symlinks and respects .gitignore
  - Auto-merges `fileSuggestion` config into `~/.claude/settings.json`

#### Model Delegation Config
- **New `delegation` Config Section** - Control sub-agent model selection
  - `enabled`: Toggle delegation (default: true)
  - `model`: `'haiku'` or `'sonnet'` (default: `'haiku'`)
  - MCP instructions updated to tell Claude which model to use for read-only tools

#### Config Auto-Upgrade
- **Session Start Config Migration** - Automatically adds missing config sections
  - Detects missing: `memoryInjection`, `permissions`, `userRules`, `gitCommitReview`, `delegation`
  - Preserves existing user settings while adding new defaults
  - No manual `/matrix:doctor` needed after upgrades

### Changed

#### Code Review Refactored
- **Simplified Review Modes** - Two modes instead of three depths
  - `default`: Comprehensive 5-phase review with full index utilization
  - `lazy`: Quick single-pass review, no index queries
- **New Config Structure** - `hooks.gitCommitReview`
  - `suggestOnCommit`: Suggest review before commits (default: true)
  - `defaultMode`: `'default'` or `'lazy'` (default: `'default'`)
  - `autoRun`: Never auto-runs, always suggests (default: false)
- **BREAKING**: Removed `depth` setting (`quick`/`standard`/`thorough`)

#### Memory Injection Config
- **Proper Config Usage** - `hooks.promptAnalysis.memoryInjection` now actually used
  - `enabled`: Toggle memory injection (default: true)
  - `maxSolutions`: Max solutions to inject (default: 3)
  - `maxFailures`: Max failures to inject (default: 2)
  - `minScore`: Minimum similarity score (default: 0.35)

#### Wildcard Permission Patterns
- **Simplified PermissionRequest matchers** - Leverages Claude Code 2.1.0+ wildcards
  - `mcp__plugin_matrix_matrix__*` replaces 11 individual tool matchers
  - `mcp__plugin_matrix_context7__*` replaces 2 individual tool matchers
  - Auto-includes new tools added to MCP servers

#### Increased Hook Timeouts
- **Leverage Claude Code 2.1.3's 10-minute limit** for complex analysis
  - `UserPromptSubmit`: 60s → **600s** (deep-research, review commands)
  - `PreCompact`: 30s → **600s** (session analysis before compaction)
  - `PreToolUse:Bash`: 30s → 60s (package auditing)
  - `Stop`: 30s → 60s (session summary)

### Fixed

- Removed unused imports in `session-start.ts` (oxlint warnings)

---

## [2.0.1] - 2025-01-09

### Added

#### Greptile-Style Code Review Output
- **Enhanced `/matrix:review`** - New output format inspired by Greptile
  - Summary with 2-3 sentence overview
  - Key Changes bullet list
  - Critical Issues Found with numbered, detailed explanations
  - Additional Issues for minor items
  - Positive Aspects for good patterns
  - **Confidence Score (1-5)** with explanation
  - **Important Files Changed** table with per-file scores (1-5)
  - Detailed File Analysis section

#### Pre-Commit Code Review
- **PreToolUse:Bash Hook** - Suggests Matrix review BEFORE commits
  - Detects `git commit` and `jj commit/describe/new` commands
  - Prompts Claude to consider running `/matrix:review staged [depth]`
  - Non-blocking suggestion to catch issues before they're committed
- **Jujutsu (jj) Support** - Works with both Git and Jujutsu VCS
- **New Config** - `hooks.gitCommitReview`
  - `enabled`: Toggle feature on/off (default: true)
  - `depth`: Review depth - `'quick'` | `'standard'` | `'thorough'` (default: `'standard'`)

### Fixed

- **Rule Engine Integration** - User-defined rules now properly evaluated in all hooks
  - `PreToolUse:Edit` - Evaluates edit rules before cursed file checks
  - `PreToolUse:Read` - Evaluates read rules before sensitive file detection
  - `UserPromptSubmit` - Evaluates prompt rules at start of analysis
  - Previously, rules were only evaluated in `PreToolUse:Bash`

### Changed

- **Deep Research Save Location** - Now saves to session directory
  - Primary: `$CLAUDE_SESSION_DIR/matrix-research-[slug]-[timestamp].md`
  - Fallback: `./matrix-research-[slug]-[timestamp].md` (current working directory)
  - Previously saved to `~/Downloads/`

---

## [2.0.0] - 2025-01-09

### Major Release - "Matrix v2"

Comprehensive release consolidating all v2 proposals (MATRIX-001 through MATRIX-005) with architectural cleanups for a leaner, more powerful system.

### Added

#### Hook Verbosity System
- **Configurable Output Verbosity** - New `hooks.verbosity` config: `'full'` | `'compact'` | `'minimal'`
  - `full`: Verbose multi-line format (backward compatible default)
  - `compact`: Single-line formats with ~80% token reduction
  - `minimal`: Near-silent, only critical blockers shown
- **New `format-helpers.ts`** - Centralized verbosity-aware formatters for all hook outputs
- **Token Savings** - Compact mode reduces per-message overhead from ~500 to ~80 tokens

#### Skill Factory (MATRIX-005)
- **`matrix_skill_candidates`** - Find solutions ready for promotion to Claude Code Skills
  - Ranks by: success rate, usage count, complexity
  - Returns top candidates with skill template suggestions
- **`matrix_link_skill`** - Link a solution to a Claude Code skill after promotion
  - Tracks `promoted_to_skill` and `promoted_at` in database
- **`/matrix:skill-candidates`** - View promotable solutions
- **`/matrix:create-skill`** - Guided skill creation from a solution

#### Code Review (MATRIX-002)
- **`matrix_find_callers`** - Find all files that import/use a symbol (inverse of find_definition)
  - Enables blast radius analysis for changes
  - Returns: file, line, import type (named, default, namespace)
- **`/matrix:review`** - 5-phase code review pipeline
  1. Context Mapping (blast radius)
  2. Intent Inference
  3. Socratic Questioning
  4. Targeted Investigation
  5. Reflection & Consolidation

#### Deep Research (MATRIX-004)
- **`/matrix:deep-research`** - Multi-source research aggregation
  - Depth levels: `quick`, `standard`, `exhaustive`
  - Sources: WebSearch, Context7, matrix_recall, matrix_repomix
  - Outputs polished markdown to `~/Downloads/`

#### User-Configurable Rules (MATRIX-001)
- **Rule Engine** - Custom pattern matching for tool events
  - Events: `bash`, `edit`, `read`, `prompt`, `write`
  - Actions: `block`, `warn`, `allow`
  - Priority-based evaluation
- **Config Section** - `hooks.userRules.rules[]` for custom rules
- **Example Rules** - Block `rm -rf`, warn on `console.log` in edits

### Changed

#### Warn Tool Consolidation
- **BREAKING**: Consolidated 4 warn tools into single `matrix_warn` with `action` parameter
  - `matrix_warn({ action: 'check', type, target })` - Check for warnings
  - `matrix_warn({ action: 'add', type, target, reason })` - Add warning
  - `matrix_warn({ action: 'remove', id })` - Remove warning
  - `matrix_warn({ action: 'list' })` - List warnings
- **Exported Result Types** - `WarnCheckResult`, `WarnAddResult`, `WarnRemoveResult`, `WarnListResult`

#### Command Consolidation
- **BREAKING**: Removed `/matrix:verify` - Use `/matrix:doctor` instead
- **BREAKING**: Removed `/matrix:stats` - Use `/matrix:list` instead (now includes stats)
- **BREAKING**: Removed `/matrix:search` - Use `matrix_recall` directly
- **Enhanced `/matrix:list`** - Now shows solutions, stats, and warnings in one command

### Database Schema

- **v4 Migration** - Added `promoted_to_skill` and `promoted_at` columns to solutions table

### Stats

- 40 files changed
- +4,005 / -315 lines
- 4 new commands, 3 removed
- 3 new MCP tools, 3 removed (net: same count, cleaner API)

---

## [1.2.2] - 2025-01-07

### Added

- **Dynamic Tool Visibility** - MCP `list_changed` notifications for smarter tool display
  - Tools are now shown/hidden based on project context
  - Index tools (`matrix_find_definition`, `matrix_search_symbols`, etc.) only appear for indexable projects
  - Core memory and warning tools always visible
  - New `toolSearch.verbose` config option to log tool visibility changes

- **Tool Categories & Metadata** - Tools now have category and visibility metadata
  - Categories: `core`, `warn`, `index`, `index-mgmt`, `utility`
  - Visibility rules: `always`, `indexable`

### Changed

- **Tool Registry** - New `ToolRegistry` class manages tool availability
  - Detects project type on MCP server startup
  - Supports 12 project types: TypeScript/JS, Python, Go, Rust, Java, Swift, C#, Ruby, PHP, Elixir, Zig, C/C++
  - Emits `list_changed` notification when context changes

## [1.2.1] - 2025-01-07

### Added

- **PostToolUse:Matrix Hook** - Contextual hints after matrix tool calls
- **Hints in Responses** - `_hints` field with actionable suggestions for recall/store/failure
- **Matrix Usage Guide** - "When to Use Matrix Tools" added to system prompt

### Changed

- **Recall Tuning** - Higher threshold (0.55) and shorter queries for less noise

## [1.2.0] - 2025-12-31

### Added

- **PermissionRequest Hook** - Auto-approve read-only tools without permission dialogs
  - Core read: `Read`, `Glob`, `Grep`
  - Web: `WebFetch`, `WebSearch`
  - Matrix read: `matrix_recall`, `matrix_status`, `matrix_find_definition`, etc.
  - Context7: `resolve-library-id`, `query-docs`
  - Configurable via `hooks.permissions` in config

- **PreToolUse:Read Hook** - Sensitive file detection with full security scan
  - Warns on: `.env`, `.pem`, `.key`, `id_rsa`, `secrets/`, `.aws/credentials`, etc.
  - Configurable behavior: `warn`, `block`, `ask`, or `disabled`
  - Custom patterns and allowlist support

- **PreCompact Hook** - Session analysis before context compaction
  - Analyzes complexity, extracts tags, summarizes session
  - Logs to `~/.claude/matrix/session-analysis.jsonl`
  - Suggests saving insights via `matrix_store`

- **matrix_doctor Tool** - Comprehensive diagnostics and auto-fix
  - Checks: directory, database, config, hooks, code index, repo detection
  - Auto-fixes: creates dirs, runs migrations, resets config, rebuilds index
  - **Data-safe**: NEVER auto-fixes corrupted databases (preserves user data)
  - New `/matrix:doctor` skill

### Changed

- **Config Location** - Moved from `~/.claude/matrix.config` to `~/.claude/matrix/matrix.config`
  - Now located next to database for easy access
  - Automatic migration from old location

- **Config Structure** - New nested configuration for hooks
  - `hooks.permissions` - Permission auto-approve settings
  - `hooks.sensitiveFiles` - File security patterns
  - `hooks.preCompact` - Session analysis settings
  - `hooks.stop` - Session completion settings
  - Backward compatible with flat config (user settings never overwritten)

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
