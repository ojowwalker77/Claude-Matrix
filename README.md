<div align="center">


<img width="1107" height="861" alt="Screenshot 2026-01-19 at 10 53 42" src="https://github.com/user-attachments/assets/8226a695-0fda-44ff-b4e1-16d5ab2fd28c" />


[![Version](https://img.shields.io/badge/v2.1.1-blue.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

<sub>Community plugin for Claude Code • Not affiliated with Anthropic</sub>

</div>

---

Matrix turns Claude Code into a complete development environment. Memory that persists across sessions. Code indexing across 15 languages. Automated hooks that catch issues before they happen. Scheduled tasks that run while you sleep.

```
/plugin marketplace add ojowwalker77/Claude-Matrix
/plugin install matrix@ojowwalker77-Claude-Matrix
```

Requires [Bun](https://bun.sh) v1.0+ and Claude Code v2.0+. Verify with `/matrix:doctor`.

> **macOS and Linux only.** Windows is not supported. Windows users must use [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) or fork the repo and adapt paths manually.

## Quick Start 

- With Sessions Modes (new in v2.1.9) this process is so much easier, choose your session intention, Claude will follow along with optimized workflow!

<img width="1095" height="586" alt="image" src="https://github.com/user-attachments/assets/8ad4af7f-065b-42ed-93c9-192c337f423d" />


---

## What You Get

| Feature | What It Does |
|---------|--------------|
| **Memory** | Solutions persist. Claude recalls what worked before. |
| **Code Index** | Find definitions, callers, exports instantly (15 languages) |
| **Hooks** | Auto-inject context, catch bad packages, warn on sensitive files |
| **Warnings** | Track problematic files/packages with CVE checks |
| **Dreamer** | Schedule tasks — daily reviews, weekly audits, automated commits |
| **Code Review** | 5-phase analysis with blast radius and impact mapping |
| **Deep Research** | Multi-source aggregation into polished markdown |
| **Context7** | Always-current library documentation |
| **Skill Factory** | Promote solutions to reusable Claude Code Skills |

---

## Memory

Solutions persist across sessions with semantic search:

```
You solve a problem → Matrix stores it
Similar problem later → Matrix recalls it
Feedback → Rankings improve
```

**Tools:** `matrix_recall` · `matrix_store` · `matrix_reward` · `matrix_failure` · `matrix_status`

---

## Code Index

Fast symbol navigation. Auto-indexed on session start.

**Languages:** TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, Swift, C#, Ruby, PHP, C, C++, Elixir, Zig

**Tools:** `matrix_find_definition` · `matrix_find_callers` · `matrix_search_symbols` · `matrix_list_exports` · `matrix_get_imports`

---

## Hooks

Matrix runs automatically in the background:

| Trigger | Action |
|---------|--------|
| Session starts | Index code, initialize memory |
| You send a prompt | Inject relevant memories |
| Before `npm install` | Check CVEs, deprecation, bundle size |
| Before editing file | Warn if file has known issues |
| Before `git commit` | Suggest code review |
| Session ends | Offer to save notable solutions |

---

## Dreamer

Schedule Claude tasks with native OS schedulers (launchd/crontab):

```
/scheduler:schedule-add
> Name: daily-review
> Schedule: every weekday at 9am
> Command: /matrix:review
```

**Use cases:** Daily code review · Weekly dependency audit · Nightly test runs · Automated changelog

**Git Worktree Mode:** Run in isolated branches that auto-commit and push.

**Safety:**
- `skipPermissions` OFF by default — respects your existing permission rules
- No custom daemon — uses native OS schedulers, no elevated privileges
- All inputs sanitized via `shellEscape()`

**Skills:** `/scheduler:schedule-add` · `schedule-list` · `schedule-run` · `schedule-remove` · `schedule-status` · `schedule-logs` · `schedule-history`

---

## Commands

| Command | Purpose |
|---------|---------|
| `/matrix:review` | 5-phase code review with impact analysis |
| `/matrix:deep-research` | Multi-source research aggregation |
| `/matrix:doctor` | Diagnostics + auto-fix |
| `/matrix:list` | View solutions, stats, warnings |
| `/matrix:warn` | Manage file/package warnings |
| `/matrix:reindex` | Rebuild code index |
| `/matrix:repomix` | Pack external repos for context |
| `/matrix:export` | Export database |
| `/matrix:skill-candidates` | View promotable solutions |
| `/matrix:create-skill` | Create skill from solution |

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

**Verbosity:** `full` (~500 tokens) · `compact` (~80, recommended) · `minimal` (~20)

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

[Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [LLM Reference](docs/reference-for-llms.md)

<div align="center">
<sub>MIT License</sub>
</div>
