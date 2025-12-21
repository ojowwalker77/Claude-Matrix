# Claude Matrix

#### NOT an official Anthropic tool

**Persistent memory for Claude Code** - Learn from past solutions, avoid repeated mistakes.



https://github.com/user-attachments/assets/0e43c647-071d-4a7d-9de4-633fee5c5e34




## Getting Started

```bash
matrix follow the white rabbit
```

Interactive Matrix-themed onboarding that teaches you all the features. Navigate through portals, learn the tools, follow the rabbit.

## Why Matrix?

Claude Code is stateless - every session starts fresh. Matrix fixes this:

- **Recall solutions** - Search past implementations semantically
- **Learn from failures** - Record errors to prevent repeating them
- **Context aware** - Solutions boosted by repo/stack similarity

## Screenshots

### Checking Matrix (matrix_recall)
<img width="1068" alt="Matrix recall in action" src="https://github.com/user-attachments/assets/bccbb0d2-f84d-4b92-b444-16a2acca24cc" />

### Rewarding Solutions (matrix_reward)
<img width="1582" alt="Matrix reward feedback" src="https://github.com/user-attachments/assets/5e818c6b-0652-42f6-8f0d-03579ac955cc" />

## Installation

### Homebrew (Recommended)

```bash
brew tap ojowwalker77/matrix
brew install matrix
matrix init
```

### Manual

```bash
git clone https://github.com/ojowwalker77/Claude-Matrix.git ~/.claude/matrix
cd ~/.claude/matrix && bun install
claude mcp add matrix -s user -- bun run ~/.claude/matrix/src/index.ts
```

Then add to `~/.claude/CLAUDE.md`:

```markdown
## Matrix Memory System

Before implementing complex tasks (5+ difficulty):
1. Call matrix_recall first
2. After solving, use matrix_store to save
3. Use matrix_reward if you used a recalled solution
4. Use matrix_failure if you fixed an error
```

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
