# Contributing to Claude Matrix

Thanks for your interest in contributing!

## Core Principle

**Increase the chance and speed for Claude Code to deliver the First Satisfying Answer** - not first-whatever-slop.

This isn't vibe coding. Every feature should demonstrably improve Claude's ability to give you a correct, useful answer faster.

## What We Accept

Features that:
- Have a **clear, measurable win**
- Are easy to test and verify
- Focus on **Claude Code CLI** (GUI compatibility as it catches up)
- Follow the bloat/win ratio (see below)

## What We Don't Accept

- **Windows compatibility** - I can't test it, so for now I won't merge it
- Features I can't easily test myself
- Features without a clear win
- Excessive bloat for marginal gains

### The Bloat/Win Ratio

```
Greater bloat = Greater win required
```

Even this has a threshold. If a feature adds significant complexity, the benefit must be proportionally significant. Some features just aren't worth it regardless of the win.

**Examples:**
- Adding 5 lines for 20% faster recall? Yes.
- Adding 500 lines for 5% edge case improvement? No.
- Adding a dependency for a minor convenience? Probably no.

## How to Contribute

### Feature Requests

1. Open an issue using the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md)
2. Clearly explain the **win** - how does this help Claude deliver better answers faster?
3. Estimate the complexity/bloat involved

### Bug Reports

1. Open an issue using the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md)
2. Include reproduction steps
3. Include your environment (OS, Bun version, Claude Code version)

### Pull Requests

1. Fork the repo
2. Create a feature branch from `main`
3. Follow the [PR template](.github/PULL_REQUEST_TEMPLATE.md)
4. Ensure tests pass: `bun test`
5. Ensure types check: `bun run tsc --noEmit`

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

## Fork It

Don't agree with these guidelines? That's fine. Fork this repo and make it your own. The [reference-for-llms.md](docs/reference-for-llms.md) has everything you need to understand and customize Matrix.

## License

By contributing, you agree that your contributions will be licensed under MIT.
