---
description: Pack external repo for context (query-first, semantic search)
---

# Matrix Repomix

Smart repository packing with semantic search. Minimizes token consumption by finding only relevant files.

## How It Works

**Two-Phase Flow:**

1. **Index Phase** (no tokens consumed)
   - Fetches file tree from GitHub API (no content)
   - Uses semantic search to find relevant files
   - Returns suggested files with token estimates
   - Asks for user confirmation

2. **Pack Phase** (tokens consumed)
   - Only runs after user confirms
   - Packs only the confirmed files
   - Returns focused, relevant code

## Key Features

- **Query Required**: Must specify what you're looking for
- **Semantic Search**: Uses embeddings to find relevant files by path
- **Smart Exclusions**: Auto-excludes tests, docs, config, node_modules
- **Token Estimates**: Shows estimated tokens BEFORE consuming any
- **Caching**: 24-hour cache for file trees and packed content

## Usage

```
/matrix:repomix <target> "<query>"
```

**Parameters:**
- `target` (required): GitHub shorthand (user/repo) or local path
- `query` (required): What implementation are you looking for?
- `--branch`: Specific branch or commit
- `--maxFiles`: Max files to suggest (default: 15)
- `--maxTokens`: Max tokens in output (default: 30000)

## Examples

```
# Find authentication implementation in Next.js
/matrix:repomix vercel/next.js "authentication middleware"

# Study RAG implementation in LangChain
/matrix:repomix langchain-ai/langchain "RAG retrieval chain"

# Analyze error handling patterns
/matrix:repomix facebook/react "error boundary implementation"

# Check local project patterns
/matrix:repomix ./other-project "API route handlers"
```

## Flow Example

```
User: /matrix:repomix vercel/next.js "app router implementation"

Claude: [Calls matrix_repomix Phase 1]

Tool Response:
{
  "phase": "index",
  "message": "Found 847 code files (~2.1M tokens). Suggesting 12 relevant files (~18k tokens).",
  "suggestedFiles": [
    "packages/next/src/server/app-render/app-render.tsx",
    "packages/next/src/client/components/app-router.tsx",
    ...
  ]
}

Claude: [Uses Bash to ask user]
$ "Found 12 relevant files (~18k tokens). Pack these? [y/n]"
$ > y

Claude: [Calls matrix_repomix Phase 2 with confirmedFiles]

Tool Response:
# Repository: vercel/next.js
Query: "app router implementation"
Files: 12 | Tokens: ~18k

[Packed content...]
```

## Comparison

| Tool | Purpose | Output |
|------|---------|--------|
| **Context7** | "How do I USE this?" | Documentation, examples |
| **Repomix** | "How does this WORK?" | Source code, implementation |

## Token Savings

| Approach | Tokens | Usefulness |
|----------|--------|------------|
| Full repo pack | 2.1M | Low (noise) |
| Directory filter | ~200k | Medium |
| **Query-driven** | **~18k** | **High** |

Typical savings: **95-99%** reduction in token usage.

## Tips

1. **Be specific with queries**: "OAuth2 implementation" > "auth"
2. **Review suggested files**: Remove irrelevant ones before confirming
3. **Use with Context7**: Get docs first, then source for deep dive
4. **Cache is your friend**: Second query on same repo is instant
