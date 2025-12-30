# Claude Matrix Roadmap

> **Vision**: "Claude on Rails" — Increase the chance and speed for Claude Code to deliver the First Satisfying Answer

---

## In Progress

### v1.1.0 — Extended Language Support

Currently supported: **TypeScript, JavaScript, Python, Go, Rust** (5 languages)

#### Phase 1: High-Priority Languages
| Language | Tree-sitter Grammar | Status |
|----------|---------------------|--------|
| C# | [tree-sitter-c-sharp](https://github.com/tree-sitter/tree-sitter-c-sharp) | 🔜 Next |
| Java | [tree-sitter-java](https://github.com/tree-sitter/tree-sitter-java) | 🔜 Next |
| Kotlin | [tree-sitter-kotlin](https://github.com/fwcd/tree-sitter-kotlin) | 🔜 Next |
| Swift | [tree-sitter-swift](https://github.com/alex-pinkus/tree-sitter-swift) | 🔜 Next |
| Ruby | [tree-sitter-ruby](https://github.com/tree-sitter/tree-sitter-ruby) | Planned |
| PHP | [tree-sitter-php](https://github.com/tree-sitter/tree-sitter-php) | Planned |
| Elixir | [tree-sitter-elixir](https://github.com/elixir-lang/tree-sitter-elixir) | Planned |
| Zig | [tree-sitter-zig](https://github.com/tree-sitter-grammars/tree-sitter-zig) | Planned |

> **Note**: Grammars sourced from [tree-sitter wiki](https://github.com/tree-sitter/tree-sitter/wiki/List-of-parsers) and [tree-sitter-grammars](https://github.com/tree-sitter-grammars) org.

---

## Future Ideas

### Agent Orchestration

Spawn subagents in git worktrees for parallel work:
- Isolated environments for different approaches
- Unified results back to main
- Automatic conflict detection

### Personal Skills Factory

Learn user patterns and generate personalized Claude Skills:
- Detect repeated workflows
- Suggest skill creation
- Export as reusable .md files

### Solution Chains

Link related solutions into workflows:
- "After X, usually do Y"
- Automatic prerequisite injection
- Multi-step solution recall

### Streaming Repomix

For large repos:
- Progressive file loading
- Token budget enforcement
- Chunked output

### Memory Sync

Share solutions across machines:
- Import memory bundles
- Selective sync (repo-specific vs global)
- Conflict resolution

---

## Completed

### v1.0.9 — Path-Based Indexing & Smart Language Detection

- [x] `repoPath` parameter on all 6 index tools
- [x] Support for absolute/relative paths (auto-resolved)
- [x] Smart language detection (25+ languages recognized)
- [x] Helpful error messages: "Detected C# project - indexing coming soon!"
- [x] Enhanced MCP instructions for tool preferences

### v1.0.8 — Expanded Haiku Delegation

- [x] 13 tools now delegable (up from 8)
- [x] MCP server instructions for delegation guidance

### v1.0.7 — Token Optimization & Haiku Delegation

- [x] Compact JSON output (10-15% token savings)
- [x] 8 tools marked as Haiku-delegable for sub-agent routing
- [x] Official MCP annotations on all 17 tools (readOnlyHint, idempotentHint, destructiveHint, openWorldHint)
- [x] Comprehensive reference-for-llms.md for self-hosting

### v1.0.6 — Repomix Integration

- [x] `matrix_repomix` tool for external repo context
- [x] Two-phase flow: Index (free) → Confirm → Pack (tokens)
- [x] Semantic file selection using Matrix embeddings
- [x] Smart exclusions (tests, docs, node_modules)
- [x] 24h cache with configurable TTL

### v1.0.5 — Migration Fixes

- [x] Fixed "no such column: category" error for existing databases
- [x] Schema version tracking in `/matrix:status`

### v1.0.3-1.0.4 — Bug Fixes

- [x] Fixed hooks detection (plugin-scoped via hooks.json)
- [x] Auto-migration on version upgrade
- [x] Plugin manifest improvements

### v1.0.2 — Multi-Language Code Index

- [x] Tree-sitter WASM parser (replaces TypeScript Compiler API)
- [x] 10 languages: TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, Ruby, PHP
- [x] Lazy grammar loading (downloaded on first use)
- [x] Auto-detection for all project types

### v1.0.1 — Enhanced Memory

- [x] New `matrix_store` fields: category, complexity, prerequisites, antiPatterns, codeBlocks
- [x] New `matrix_recall` filters: categoryFilter, maxComplexity
- [x] Auto-complexity calculation (1-10)
- [x] Solution evolution via `supersedes`

### v1.0.0 — First Stable Release

- [x] Core MCP tools (recall, store, reward, failure, status)
- [x] Local embeddings with transformers.js
- [x] Repository fingerprinting
- [x] Warning system (files/packages)
- [x] 7 Claude Code hooks
- [x] Context7 integration
- [x] Package auditing (CVEs, deprecation)

---

## Contributing

Ideas? Open an issue or PR at [github.com/ojowwalker77/Claude-Matrix](https://github.com/ojowwalker77/Claude-Matrix)
