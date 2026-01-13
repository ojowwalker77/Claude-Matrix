<div align="center">

<img src="https://github.com/user-attachments/assets/e8e0f547-87ae-4a4e-94fb-681e834915fe" alt="Matrix" width="180" />

# Claude Matrix

**Persistent Memory & Tooling for Claude Code**

[![Version](https://img.shields.io/badge/v2.0.2-blue.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![LLM Reference](https://img.shields.io/badge/LLM-reference-purple.svg)](docs/reference-for-llms.md)

<sub>Community plugin for Claude Code • Not affiliated with Anthropic</sub>

</div>

---

## Why Matrix?

Claude Code is exceptional at coding. Matrix makes it exceptional at *everything else*—remembering what worked, navigating codebases, catching bad dependencies, and turning insights into reusable skills.

| Without Matrix | With Matrix |
|----------------|-------------|
| Solutions forgotten next session | **Memory** recalls what worked before |
| Grep/find for symbol locations | **Code Index** finds definitions instantly (15 languages) |
| Bad packages discovered too late | **Warnings** + CVE checks catch them first |
| Library docs out of date | **Context7** provides current documentation |
| Good solutions stay buried | **Skill Factory** promotes them to reusable Skills |
| Changes break unknown callers | **Blast Radius** shows impact before you commit |
| Need context from external repos | **Repomix** packs them with semantic file selection |
| Research scattered across tabs | **Deep Research** aggregates sources into polished markdown |
| Code reviews miss the big picture | **Code Review** runs 5-phase analysis with impact mapping |

---

## Install

```
/plugin marketplace add ojowwalker77/Claude-Matrix
/plugin install matrix@ojowwalker77-Claude-Matrix
```

Requires [Bun](https://bun.sh) v1.0+ and Claude Code v2.0+

Verify with `/matrix:doctor`

> **Platform:** macOS and Linux only. Windows users should use [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) or fork the repo and adjust paths manually.

---

## What's New in v2.0

### v2.0.2
- **Subagent Hooks** — `SubagentStart` injects Matrix guidance to Explore/Plan agents
- **Wildcard Warnings** — Glob patterns in warning rules (`src/legacy/**`)
- **Hook Timeouts** — Configurable timeout (default 30s, max 120s)
- **Index Tools Anywhere** — Query any indexed repo via `repoPath` parameter
- **Token Optimization** — ~10-12% reduction in MCP tool definitions

### v2.0.0
- **Hook Verbosity** — `compact` mode cuts token overhead by 80%
- **Unified Warn API** — Single `matrix_warn` tool with `action` parameter
- **Skill Factory** — Promote high-value solutions to Claude Code Skills
- **Blast Radius** — `matrix_find_callers` shows impact before changes
- **Code Review** — 5-phase review pipeline via `/matrix:review`
- **Deep Research** — Multi-source aggregation via `/matrix:deep-research`
- **User Rules** — Custom pattern matching (block, warn, allow)

### Breaking Changes (v2.0)
- Removed: `/matrix:verify`, `/matrix:stats`, `/matrix:search`
- Changed: Four warn tools → single `matrix_warn`

See [CHANGELOG.md](CHANGELOG.md) for details.

---

## Features

### Memory System

Solutions persist across sessions with semantic search:

```
You solve a problem → Matrix stores it with embeddings
                            ↓
       Similar problem later → Matrix recalls the solution
                            ↓
            Feedback → Rankings improve over time
```

| Tool | Purpose |
|------|---------|
| `matrix_recall` | Search for relevant solutions |
| `matrix_store` | Save a solution |
| `matrix_reward` | Provide feedback on solutions |
| `matrix_failure` | Record errors and fixes |
| `matrix_status` | View memory statistics |

### Code Index

Fast navigation across 15 languages—auto-indexed on session start.

**Languages:** TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, Swift, C#, Ruby, PHP, C, C++, Elixir, Zig

| Tool | Purpose |
|------|---------|
| `matrix_find_definition` | Find where a symbol is defined |
| `matrix_find_callers` | Find all files that use a symbol |
| `matrix_search_symbols` | Search by partial name |
| `matrix_list_exports` | List exports from file/directory |
| `matrix_get_imports` | Get imports for a file |
| `matrix_reindex` | Manually trigger reindexing |

### Warnings

Track problematic files and packages with a unified API:

```javascript
matrix_warn({ action: 'check', type: 'file', target: 'src/legacy.ts' })
matrix_warn({ action: 'add', type: 'package', target: 'moment', reason: 'Use date-fns' })
matrix_warn({ action: 'remove', id: 'warn_abc123' })
matrix_warn({ action: 'list' })
```

### Skill Factory

Identify and promote high-value solutions to Claude Code Skills:

| Tool | Purpose |
|------|---------|
| `matrix_skill_candidates` | Find solutions ready for promotion |
| `matrix_link_skill` | Link solution to a created skill |

### External Context

| Tool | Purpose |
|------|---------|
| `matrix_repomix` | Pack external repos with semantic file selection |
| `resolve-library-id` | Find library ID for documentation |
| `query-docs` | Get current library documentation (Context7) |

### Diagnostics

| Tool | Purpose |
|------|---------|
| `matrix_doctor` | Run diagnostics and auto-fix issues |

---

## Automatic Hooks

Matrix runs in the background without explicit invocation:

| Trigger | Action |
|---------|--------|
| Session starts | Initialize database, index code |
| Permission requested | Auto-approve read-only tools |
| You send a prompt | Analyze complexity, inject memories |
| Before reading file | Warn if sensitive (`.env`, keys) |
| Before `npm install` | Check CVEs, deprecation, size |
| Before editing file | Warn if file has known issues |
| Before web fetch | Redirect library docs to Context7 |
| Before compaction | Save session insights |
| Session ends | Offer to save notable solutions |

---

## Commands

| Command | Purpose |
|---------|---------|
| `/matrix:list` | View solutions, stats, warnings |
| `/matrix:doctor` | Diagnostics + auto-fix |
| `/matrix:warn` | Manage warnings |
| `/matrix:reindex` | Rebuild code index |
| `/matrix:repomix` | Pack external repo |
| `/matrix:export` | Export database |
| `/matrix:review` | 5-phase code review |
| `/matrix:deep-research` | Multi-source research |
| `/matrix:skill-candidates` | View promotable solutions |
| `/matrix:create-skill` | Create skill from solution |

---

## Configuration

Matrix creates `~/.claude/matrix/matrix.config` on first run:

```json
{
  "indexing": {
    "enabled": true,
    "excludePatterns": [],
    "maxFileSize": 1048576,
    "includeTests": false
  },
  "hooks": {
    "enabled": true,
    "verbosity": "compact",
    "permissions": {
      "autoApproveReadOnly": true,
      "autoApprove": {
        "coreRead": true,
        "web": true,
        "matrixRead": true,
        "context7": true
      }
    },
    "userRules": {
      "enabled": true,
      "rules": []
    }
  }
}
```

### Verbosity Levels

| Level | Tokens | Description |
|-------|--------|-------------|
| `full` | ~500 | Verbose (default) |
| `compact` | ~80 | Recommended |
| `minimal` | ~20 | Critical only |

### User Rules

Add custom patterns to `hooks.userRules.rules[]`:

```json
{
  "name": "block-rm-rf",
  "event": "bash",
  "pattern": "rm\\s+-rf\\s+/",
  "action": "block",
  "message": "Dangerous command blocked"
}
```

See **[User Rules Templates](docs/user-rules-templates.md)** for 30+ ready-to-use rules.

---

## Performance

### MCP Annotations

All 18 tools include official MCP hints:

| Hint | Count | Meaning |
|------|-------|---------|
| `readOnlyHint` | 11 | No side effects |
| `idempotentHint` | 6 | Safe to retry |
| `destructiveHint` | 1 | Deletes data |
| `openWorldHint` | 1 | External API |

### Haiku Delegation

12 tools delegable to Haiku sub-agents for cost optimization:

```
matrix_recall, matrix_reward, matrix_status, matrix_warn
matrix_find_definition, matrix_find_callers, matrix_search_symbols
matrix_list_exports, matrix_get_imports, matrix_index_status
matrix_reindex, matrix_skill_candidates
```

<details>
<summary>Example: Haiku sub-agent executing matrix_recall</summary>

<img width="919" alt="Haiku delegation" src="https://github.com/user-attachments/assets/f119550f-1be5-47d7-ad70-b896759ce237" />

</details>

---

## Data Storage

```
~/.claude/matrix/
├── matrix.db              # SQLite database
├── matrix.config          # Configuration
├── models/                # Embedding model (~23MB)
├── grammars/              # Tree-sitter parsers (on-demand)
└── session-analysis.jsonl # Session logs
```

All data local. No external API calls for memory.

---

## Update

Navigate to `/plugin` → **Marketplaces** → **Update marketplace**

<details>
<summary>Screenshot</summary>

<img width="1792" alt="Update" src="https://github.com/user-attachments/assets/26caecf8-b859-4bb1-9880-298fd756a401" />

</details>

> **Note:** Claude Code updates have [known quirks](https://github.com/anthropics/claude-code/issues/11856). May require restart or multiple attempts.

---

## Development

```bash
git clone https://github.com/ojowwalker77/Claude-Matrix
cd Claude-Matrix
bun install
bun run build
bun test
```

Test locally:
```bash
claude --plugin-dir /path/to/Claude-Matrix
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

**We don't accept:**
- Windows compatibility (untestable)
- Features without clear wins
- Bloat for marginal gains

**Core principle:** Maximize the chance Claude delivers the **First Satisfying Answer**.

---

## Fork It

Make Matrix yours:

```
Ask Claude: "Fork Claude Matrix using docs/reference-for-llms.md
             and customize it for my workflow"
```

The [LLM Reference](docs/reference-for-llms.md) has everything Claude needs.

---

<div align="center">

[Changelog](CHANGELOG.md) • [Roadmap](ROADMAP.md) • [Contributing](CONTRIBUTING.md) • [Issues](https://github.com/ojowwalker77/Claude-Matrix/issues)

MIT License

</div>
