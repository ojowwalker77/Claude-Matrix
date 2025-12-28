# Claude Matrix

**Claude on Rails** - Tooling System for Claude Code.

> Not an official Anthropic tool.

## Features

- **Memory** - Solutions persist across sessions with semantic search
- **Code Index** - Fast navigation for TypeScript/JavaScript codebases
- **Warnings** - Track problematic files and packages
- **Hooks** - Automatic context injection, package auditing, library docs
- **Context7** - Up-to-date documentation for 100+ libraries

## Install

```
/plugin marketplace add ojowwalker77/Claude-Matrix
/plugin install matrix@ojowwalker77-Claude-Matrix
```

Requires [Bun](https://bun.sh) v1.0+ and [Claude Code](https://claude.ai/code) v2.0+.

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

**Supported Languages**: TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, Ruby, PHP

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

### Context7

Up-to-date library documentation (bundled):

| Tool | Purpose |
|------|---------|
| `resolve-library-id` | Find library ID for docs |
| `get-library-docs` | Get current documentation |

### Repomix

Pack external repositories into AI-friendly context:

| Tool | Purpose |
|------|---------|
| `matrix_repomix` | Pack a repo for full source context |

**Context7 vs Repomix:**
- Context7 = "How do I USE this library?" (documentation)
- Repomix = "How does this library WORK?" (source code)

```
/matrix:repomix langchain-ai/langchain --include "libs/core/**"
```

## Automatic Hooks

Matrix runs automatically in the background:

| When | What Happens |
|------|--------------|
| Session starts | Initialize database, index code files (10 languages supported) |
| You send a prompt | Analyze complexity, inject relevant memories, detect code navigation queries |
| Before `npm install` | Check for CVEs, deprecation, bundle size |
| Before editing a file | Warn if file has known issues |
| Before web fetch | Intercept library docs → use Context7 instead |
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
| `/matrix:repomix <target>` | Pack external repo for context |

## Configuration

Matrix stores config at `~/.claude/matrix.config`:

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
    "complexityThreshold": 5
  }
}
```

## Data

```
~/.claude/matrix/
├── matrix.db      # SQLite database
├── models/        # Embedding model cache (~23MB)
├── grammars/      # Tree-sitter WASM grammars (downloaded on demand)
└── .initialized   # Version marker
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

## Links

- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Issues](https://github.com/ojowwalker77/Claude-Matrix/issues)

## License

MIT
