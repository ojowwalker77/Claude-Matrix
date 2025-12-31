# Claude Matrix

**Claude on Rails** - Tooling System for Claude Code.

> Not an official Anthropic tool.

<p align="center">
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="Contributing"></a>
  <a href="docs/reference-for-llms.md"><img src="https://img.shields.io/badge/LLM-reference-blue.svg" alt="LLM Reference"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License"></a>
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/e8e0f547-87ae-4a4e-94fb-681e834915fe" alt="Matrix Star" width="200" />
</p>

## Features

- **Memory** - Solutions persist across sessions with semantic search
- **Code Index** - Fast navigation for 15 languages (TS, JS, Python, Go, Rust, Java, C, C++, etc.)
- **Repomix** - Pack external repos for context with token-efficient two-phase flow
- **Warnings** - Track problematic files and packages
- **Hooks** - Auto-approve tools, sensitive file detection, session analysis, package auditing
- **Context7** - Up-to-date documentation for 100+ libraries
- **Doctor** - Comprehensive diagnostics with auto-fix
- **Optimized** - Compact JSON, Haiku-delegable tools, MCP annotations

## What's New in v1.2

- **Auto-Approve Hooks** - Read-only tools approved automatically (configurable)
- **Sensitive File Detection** - Warns on `.env`, `.pem`, `secrets/`, etc.
- **Session Analysis** - Extracts insights before context compaction
- **`/matrix:doctor`** - Diagnose and auto-fix common issues
- **Config Moved** - Now at `~/.claude/matrix/matrix.config` (auto-migrated)

See [CHANGELOG.md](CHANGELOG.md) for full details.

## Install

```
/plugin marketplace add ojowwalker77/Claude-Matrix
/plugin install matrix@ojowwalker77-Claude-Matrix
```

Requires [Bun](https://bun.sh) v1.0+ and [Claude Code](https://claude.ai/code) v2.0+.

## How to Update

Navigate to `/plugin` → **Marketplaces** tab → Select **Update marketplace**:

<img width="1792" alt="Plugin marketplace update" src="https://github.com/user-attachments/assets/26caecf8-b859-4bb1-9880-298fd756a401" />

> **Note:** The update mechanism in Claude Code has [known quirks](https://github.com/anthropics/claude-code/issues/11856). Updates may not take effect immediately—sometimes requiring a restart, cache invalidation ([#14061](https://github.com/anthropics/claude-code/issues/14061)), or multiple attempts. This is a Claude Code limitation, not Matrix.

## MCP Tools

### Memory

Claude learns from your solutions and mistakes:

```
You solve a problem
    ↓
Matrix stores it with semantic embeddings
    ↓
Next time you face something similar, Matrix recalls it
    ↓
Feedback improves rankings over time
```

| Tool | Purpose |
|------|---------|
| `matrix_recall` | Search for relevant solutions |
| `matrix_store` | Save a solution for future use |
| `matrix_reward` | Feedback on recalled solutions |
| `matrix_failure` | Record errors and fixes |
| `matrix_status` | Memory statistics |

### Code Index

Multi-language code navigation (auto-indexed on session start):

**Supported Languages**: TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, Swift, C#, Ruby, PHP, C, C++, Elixir, Zig

| Tool | Purpose |
|------|---------|
| `matrix_find_definition` | Find where a symbol is defined |
| `matrix_search_symbols` | Search symbols by partial name |
| `matrix_list_exports` | List exports from file/directory |
| `matrix_get_imports` | Get imports for a file |
| `matrix_reindex` | Manually trigger reindexing |

Grammars are downloaded on first use (~1-2MB per language) and cached locally.

### Warnings

Track problematic files and packages:

| Tool | Purpose |
|------|---------|
| `matrix_warn_check` | Check if file/package has warnings |
| `matrix_warn_add` | Mark something as problematic |
| `matrix_warn_remove` | Remove a warning |
| `matrix_warn_list` | List all warnings |

### Repomix

Pack external repositories for context with minimal token consumption:

```
Phase 1: Index repo (free) → suggest relevant files
    ↓
Phase 2: User confirms → pack selected files (tokens)
```

| Tool | Purpose |
|------|---------|
| `matrix_repomix` | Pack external repos with semantic file selection |

Supports GitHub shorthand (`owner/repo`) or local paths. Smart exclusions for tests, docs, node_modules.

### Context7

Up-to-date library documentation (bundled):

| Tool | Purpose |
|------|---------|
| `resolve-library-id` | Find library ID for docs |
| `query-docs` | Get current documentation |

### Diagnostics

| Tool | Purpose |
|------|---------|
| `matrix_doctor` | Run diagnostics and auto-fix issues |

## Automatic Hooks

Matrix runs automatically in the background:

| When | What Happens |
|------|--------------|
| Session starts | Initialize database, index code files (15 languages) |
| Permission requested | Auto-approve read-only tools (configurable) |
| You send a prompt | Analyze complexity, inject relevant memories |
| Before reading a file | Warn if sensitive (`.env`, keys, secrets) |
| Before `npm install` | Check for CVEs, deprecation, bundle size |
| Before editing a file | Warn if file has known issues |
| Before web fetch | Intercept library docs → use Context7 instead |
| Before context compaction | Analyze session, save insights |
| Session ends | Offer to save significant solutions |

## Slash Commands

| Command | Purpose |
|---------|---------|
| `/matrix:search <query>` | Search solutions |
| `/matrix:list` | List stored solutions |
| `/matrix:stats` | Show statistics |
| `/matrix:warn` | Manage warnings |
| `/matrix:export` | Export database |
| `/matrix:verify` | Check installation |
| `/matrix:reindex` | Reindex repository |
| `/matrix:repomix` | Pack external repo for context |
| `/matrix:doctor` | Run diagnostics and auto-fix |

## Performance

### Token Optimization

- **Compact JSON** - All tool outputs use compact JSON (~10-15% token savings)

### MCP Annotations

All 18 tools include official MCP hints for smarter handling:

| Annotation | Tools | Meaning |
|------------|-------|---------|
| `readOnlyHint` | 11 | No side effects, just queries |
| `idempotentHint` | 6 | Safe to retry on failure |
| `destructiveHint` | 1 | Deletes data (warn_remove) |
| `openWorldHint` | 1 | External API (repomix) |

### Haiku Delegation

13 tools marked as `delegable` for sub-agent routing via MCP server instructions:

```
matrix_recall, matrix_reward, matrix_status
matrix_warn_check, matrix_warn_add, matrix_warn_remove, matrix_warn_list
matrix_find_definition, matrix_search_symbols, matrix_list_exports, matrix_get_imports
matrix_index_status, matrix_reindex
```

These are read-only/simple operations - the model just passes parameters, server does the work. Non-delegable tools (`matrix_store`, `matrix_failure`, `matrix_prompt`, `matrix_repomix`, `matrix_doctor`) require Opus reasoning.

**Example:** Haiku 4.5 sub-agent executing `matrix_recall`:

<img width="919" alt="Haiku subagent delegation example" src="https://github.com/user-attachments/assets/f119550f-1be5-47d7-ad70-b896759ce237" />

## Configuration

Matrix creates config at `~/.claude/matrix/matrix.config` on first run:

```json
{
  "indexing": {
    "enabled": true,
    "excludePatterns": [],
    "maxFileSize": 1048576,
    "timeout": 60,
    "includeTests": false
  },
  "hooks": {
    "enabled": true,
    "permissions": {
      "autoApproveReadOnly": true,
      "autoApprove": {
        "coreRead": true,
        "web": true,
        "matrixRead": true,
        "context7": true
      }
    },
    "sensitiveFiles": {
      "enabled": true,
      "behavior": "ask"
    },
    "preCompact": {
      "enabled": true,
      "behavior": "suggest"
    }
  }
}
```

## Data

```
~/.claude/matrix/
├── matrix.db           # SQLite database
├── matrix.config       # Configuration file
├── models/             # Embedding model cache (~23MB)
├── grammars/           # Tree-sitter WASM grammars (downloaded on demand)
├── session-analysis.jsonl  # PreCompact logs
└── .initialized        # Version marker
```

All data stays local. No external API calls for memory. Package auditing uses public APIs (OSV.dev, npm, Bundlephobia).

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

## Contributing

Want to contribute? Check [CONTRIBUTING.md](CONTRIBUTING.md) first.

**What we don't accept:**
- Windows compatibility (can't test it)
- Features without a clear win
- High bloat for marginal gains

**Core principle:** Increase the chance and speed for Claude Code to deliver the **First Satisfying Answer** - not first-whatever-slop.

Submit issues and PRs using our [templates](.github/ISSUE_TEMPLATE/).

## Fork

Don't agree with how Matrix works? Fork it and make it yours:

```
Ask Claude: "Fork Claude Matrix using docs/reference-for-llms.md
             and customize it for my workflow"
```

The [reference-for-llms.md](docs/reference-for-llms.md) contains everything Claude needs to understand, customize, and help you self-host your own version through your own plugin marketplace.

## Links

- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [LLM Reference](docs/reference-for-llms.md)
- [Issues](https://github.com/ojowwalker77/Claude-Matrix/issues)

## License

MIT
