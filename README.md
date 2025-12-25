# Claude Matrix

> **Note**: Looking for the old CLI version? See the [`legacy-main`](https://github.com/ojowwalker77/Claude-Matrix/tree/legacy-main) branch.

#### NOT an official Anthropic tool

**Tooling System for Claude Code** - Claude on Rails.

## Requirements

- [Bun](https://bun.sh) v1.0+ (`curl -fsSL https://bun.sh/install | bash`)
- [Claude Code](https://claude.ai/code) v2.0+

## Installation

Inside Claude Code, run:

```
/plugin marketplace add ojowwalker77/Claude-Matrix
/plugin install matrix@ojowwalker77-Claude-Matrix
```

That's it. Matrix initializes automatically on first session.

## What It Does

Matrix gives Claude Code a memory that persists across sessions:

- **Recall solutions** - Semantic search finds relevant past solutions
- **Learn from errors** - Records failures and their fixes
- **Warn about problems** - Flags problematic files and packages
- **Audit dependencies** - Checks packages for CVEs before install
- **Context7 included** - Up-to-date library documentation

## Screenshots

### Checking Matrix (matrix_recall)
<img width="1068" alt="Matrix recall in action" src="https://github.com/user-attachments/assets/bccbb0d2-f84d-4b92-b444-16a2acca24cc" />

### Rewarding Solutions (matrix_reward)
<img width="1582" alt="Matrix reward feedback" src="https://github.com/user-attachments/assets/5e818c6b-0652-42f6-8f0d-03579ac955cc" />

## MCP Tools

Available automatically after install:

| Tool | Description |
|------|-------------|
| `matrix_recall` | Search for relevant solutions |
| `matrix_store` | Save a solution for future use |
| `matrix_reward` | Provide feedback on a solution |
| `matrix_failure` | Record an error and its fix |
| `matrix_status` | Get memory statistics |
| `matrix_warn_check` | Check if file/package has warnings |
| `matrix_warn_add` | Add a warning |
| `matrix_warn_remove` | Remove a warning |
| `matrix_warn_list` | List all warnings |

**Context7** (bundled):
| Tool | Description |
|------|-------------|
| `resolve-library-id` | Find library ID for documentation |
| `get-library-docs` | Get up-to-date library documentation |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/matrix:search <query>` | Search for solutions |
| `/matrix:list` | List stored solutions |
| `/matrix:stats` | Show memory statistics |
| `/matrix:warn` | Manage file/package warnings |
| `/matrix:export` | Export database |
| `/matrix:verify` | Check installation health |

## Hooks (Automatic)

Matrix hooks run automatically:

| Hook | Trigger | Action |
|------|---------|--------|
| **SessionStart** | Claude Code starts | Initializes database on first run |
| **UserPromptSubmit** | User sends prompt | Injects relevant memories for complex tasks |
| **PreToolUse:Bash** | Before package install | Audits for CVEs, deprecation, size |
| **PreToolUse:Edit** | Before file edit | Warns about problematic files |
| **PostToolUse:Bash** | After package install | Logs installed dependencies |
| **Stop** | Session ends | Offers to save significant sessions |

## How It Works

1. You solve a problem
2. Matrix stores the solution with semantic embeddings
3. Next time you face a similar problem, Matrix recalls it
4. Feedback improves solution rankings over time

## Data Location

```
~/.claude/matrix/
├── matrix.db      # SQLite database
├── models/        # Embedding model cache (~23MB)
└── .initialized   # Version marker
```

## Privacy

- 100% local - no data leaves your machine
- No API calls for memory - embeddings computed locally
- Package auditing uses public APIs (OSV.dev, npm, Bundlephobia)
- Single SQLite file - easy to backup or delete

## Development

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Claude Code](https://claude.ai/code) v2.0+

### Setup

```bash
git clone https://github.com/ojowwalker77/Claude-Matrix
cd Claude-Matrix
bun install
bun run build
```

### Test Locally

```bash
claude --plugin-dir /path/to/Claude-Matrix
```

### Contributing

1. Fork and branch from `dev`
2. Make changes and run `bun test`
3. Build with `bun run build`
4. Open PR targeting `dev` branch

## Upgrading

Inside Claude Code:

```
/plugin update matrix@ojowwalker77-Claude-Matrix
```

## Links

- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)

## Contributors

<!-- CONTRIBUTORS-START -->
<a href="https://github.com/CairoAC"><img src="https://github.com/CairoAC.png" width="50" height="50" alt="CairoAC"/></a>
<!-- CONTRIBUTORS-END -->

## License

MIT
