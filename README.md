<div align="center">


<img width="1107" height="861" alt="Screenshot 2026-01-19 at 10 53 42" src="https://github.com/user-attachments/assets/8226a695-0fda-44ff-b4e1-16d5ab2fd28c" />


[![Version](https://img.shields.io/badge/v2.4.0-blue.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

<sub>Community plugin for Claude Code. Not affiliated with Anthropic.</sub>

If Matrix saved you time, be kind and leave a star.

</div>

---

Matrix gives Claude Code persistent memory and deep code intelligence. Solutions survive across sessions. A tree-sitter index makes symbol navigation instant across 15 languages. Hooks catch problems before they happen.

```
/plugin marketplace add ojowwalker77/Claude-Matrix
/plugin install matrix@ojowwalker77-Claude-Matrix
```

Requires [Bun](https://bun.sh) v1.0+ and Claude Code v2.0+. Verify with `/matrix:doctor`.

> **macOS and Linux only.** Windows users need [WSL](https://learn.microsoft.com/en-us/windows/wsl/install).

## What You Get

| Feature | What It Does |
|---------|--------------|
| **Memory** | Solutions persist. Claude recalls what worked before. |
| **Code Index** | Find definitions, callers, exports instantly (15 languages) |
| **Hooks** | Auto-approve reads, catch bad packages, warn on sensitive files |
| **Warnings** | Track problematic files and packages with CVE checks |
| **Code Review** | 5-phase analysis with blast radius and impact mapping |
| **Deep Research** | Multi-source research aggregation |
| **Nuke** | Dead code, orphaned files, circular dependencies, stale TODOs |
| **Context7** | Always-current library documentation |

---

## Memory

Solutions persist across sessions with semantic search:

```
You solve a problem    ->  Matrix stores it
Similar problem later  ->  Matrix recalls it
Feedback               ->  Rankings improve
```

**Tools:** `matrix_recall` `matrix_store` `matrix_reward` `matrix_failure` `matrix_status`

---

## Code Index

Fast symbol navigation powered by tree-sitter. Auto-indexed on session start. Respects `.gitignore`. Uses content hashing for reliable incremental updates.

**Languages:** TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, Swift, C#, Ruby, PHP, C, C++, Elixir, Zig

**Tools:** `matrix_find_definition` `matrix_find_callers` `matrix_search_symbols` `matrix_list_exports` `matrix_get_imports` `matrix_find_dead_code` `matrix_find_circular_deps`

---

## Hooks

Matrix runs automatically in the background:

| Trigger | Action |
|---------|--------|
| Session starts | Index code, initialize memory |
| Tool permission requested | Auto-approve read-only tools |
| Before `npm install` | Check CVEs, deprecation, bundle size |
| Before reading file | Warn if sensitive (.env, keys, secrets) |
| Before editing file | Warn if file has known issues |

---

## Commands

| Command | Purpose |
|---------|---------|
| `/matrix:review` | 5-phase code review with impact analysis |
| `/matrix:deep-research` | Multi-source research aggregation |
| `/matrix:nuke` | Codebase hygiene analysis |
| `/matrix:doctor` | Diagnostics and auto-fix |
| `/matrix:list` | View solutions, stats, warnings |
| `/matrix:warn` | Manage file/package warnings |
| `/matrix:reindex` | Rebuild code index |

---

## Configuration

Config at `~/.claude/matrix/matrix.config`:

```json
{
  "hooks": {
    "verbosity": "compact",
    "permissions": { "autoApproveReadOnly": true }
  },
  "delegation": { "enabled": true, "model": "haiku" }
}
```

**Verbosity:** `full` (~500 tokens) or `compact` (~80, recommended)

**Model Delegation:** Routes simple ops to Haiku for ~40-50% cost savings.

---

## Data

```
~/.claude/matrix/
├── matrix.db       # SQLite database
├── matrix.config   # Configuration
├── models/         # Embedding model (~23MB)
└── grammars/       # Tree-sitter parsers
```

All data local. No external API calls for memory.

---

## Links

[Changelog](CHANGELOG.md) [LLM Reference](docs/reference-for-llms.md)

<div align="center">
<sub>MIT License</sub>
</div>
