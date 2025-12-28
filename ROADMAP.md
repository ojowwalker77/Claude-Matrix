# Claude Matrix Roadmap

> **Vision**: "Claude on Rails" — Zero-friction AI development with persistent memory, parallel agents, and intelligent prompting.

---

## v1.0.2 — RELEASED

Multi-language code indexing with tree-sitter:

- [x] Tree-sitter WASM parser (replaces TypeScript Compiler API)
- [x] 10 languages: TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, Ruby, PHP
- [x] Lazy grammar loading (downloaded on first use, cached locally)
- [x] Zero bundled overhead (grammars fetched from unpkg.com)
- [x] Auto-detection for all project types

---

## v1.0.0 — RELEASED

The first stable release focuses on **Memory + Hooks + Context7**:

- [x] Core MCP tools (recall, store, reward, failure, status)
- [x] Local embeddings with transformers.js
- [x] Repository fingerprinting
- [x] Context-aware scoring
- [x] Warning system (files/packages)
- [x] Claude Code hooks (7 hooks total)
- [x] Prompt Agent with hook integration
- [x] Context7 WebFetch/WebSearch intercept
- [x] Complexity estimation
- [x] Package auditing (CVEs, deprecation)

---
## Upcoming Features

**Personal Skills Factory**

Suggests personalized Claude Skills when specific workflows are detected. Matrix learns your patterns and generates reusable skills tailored to how you work.

**Worktrees & Agent Orchestration**

Spawn subagents in separate git worktrees to work on different features or explore and test different approaches in parallel. Isolated environments, unified results.

**Tree-sitter Integration**

Language-agnostic code indexing powered by Tree-sitter. Structural understanding of any language with a grammar - not just TS/JS.

**Repomix Integration**

Flatten external repos into Claude-digestible context. Built on Repomix by @yamadashy.

