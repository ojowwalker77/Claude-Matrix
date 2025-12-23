# Claude Matrix

#### NOT an official Anthropic tool

**Persistent memory for Claude Code** - Learn from past solutions, avoid repeated mistakes.

Supports **Claude Code** and **Cursor**.


https://github.com/user-attachments/assets/0e43c647-071d-4a7d-9de4-633fee5c5e34



## Getting Started

```bash
matrix follow the white rabbit
```

Interactive Matrix-themed onboarding that teaches you all the features. Navigate through portals, learn the tools, follow the rabbit.

## Why Matrix?

- **Recall solutions** - Search past implementations semantically
- **Learn from failures** - Record errors to prevent repeating them
- **Context aware** - Solutions boosted by repo/stack similarity

## Screenshots

### Checking Matrix (matrix_recall)
<img width="1068" alt="Matrix recall in action" src="https://github.com/user-attachments/assets/bccbb0d2-f84d-4b92-b444-16a2acca24cc" />

### Rewarding Solutions (matrix_reward)
<img width="1582" alt="Matrix reward feedback" src="https://github.com/user-attachments/assets/5e818c6b-0652-42f6-8f0d-03579ac955cc" />

## Installation

### Quick Install (Recommended)

**macOS / Linux / WSL:**
```bash
curl -fsSL https://raw.githubusercontent.com/ojowwalker77/Claude-Matrix/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
iwr https://raw.githubusercontent.com/ojowwalker77/Claude-Matrix/main/install.ps1 | iex
```

Auto-detects your OS, installs Bun if needed, and sets everything up.

### Homebrew (macOS)

```bash
brew tap ojowwalker77/matrix
brew install matrix
matrix init
```

### Manual (Git Clone)

```bash
git clone https://github.com/ojowwalker77/Claude-Matrix.git ~/.claude/matrix
cd ~/.claude/matrix && bun install
matrix init
```

The `init` command will prompt you to choose your editor:
- **Claude Code** - Registers MCP server and configures `~/.claude/CLAUDE.md`
- **Cursor** - Configures `~/.cursor/mcp.json` and `~/.cursorrules`
- **Both** - Configures both editors (shared memory)

### Upgrading

```bash
# Check for updates
matrix upgrade --check

# Install updates
matrix upgrade
```

Matrix automatically checks for updates and notifies you when a new version is available.

## Tools

| Tool | Purpose |
|------|---------|
| `matrix_recall(query)` | Search for relevant solutions |
| `matrix_store(problem, solution, scope)` | Save a solution |
| `matrix_reward(solutionId, outcome)` | Give feedback (success/partial/failure) |
| `matrix_failure(errorType, message, fix)` | Record an error pattern |
| `matrix_status()` | Check memory stats |

→ [Full tool reference](docs/tools.md)

## CLI

```bash
matrix search "OAuth implementation"
matrix list solutions
matrix stats
matrix export --format=json
```

→ [CLI reference](docs/cli.md) · [Shell completions](docs/shell-completions.md)

## Privacy

- 100% local - no data leaves your machine
- No API calls - embeddings computed locally
- Single SQLite file - easy to backup or delete

## Links

- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Architecture](docs/architecture.md)

## Contributors

<!-- CONTRIBUTORS-START -->
<a href="https://github.com/CairoAC"><img src="https://github.com/CairoAC.png" width="50" height="50" alt="CairoAC"/></a>
<!-- CONTRIBUTORS-END -->

## License

MIT
