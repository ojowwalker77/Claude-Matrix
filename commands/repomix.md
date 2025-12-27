---
description: Pack external repo for context
---

# Matrix Repomix

Pack a repository into AI-friendly context using Repomix.

## What it does

- Fetches and flattens a repository into a single context file
- Works with GitHub repos (user/repo) or local paths
- Caches results for 1 hour to avoid refetching
- Token-limited output to fit context windows

## When to use

**Complementary to Context7:**
- Context7 = "How do I USE this library?" (documentation)
- Repomix = "How does this library WORK?" (source code)

**Primary use cases:**
1. Analyze external library implementations
2. Study patterns and architecture in other codebases
3. Get full source context for detailed questions
4. Learn from open source implementations

## Usage

```
/matrix:repomix <target> [options]
```

**Parameters:**
- `target` (required): GitHub shorthand (user/repo) or local path
- `--branch`: Specific branch or commit
- `--include`: Glob patterns to filter files (comma-separated)
- `--compress`: Compress to function signatures only
- `--style`: Output format (xml, markdown, plain)

## Examples

```
# Pack a GitHub repo
/matrix:repomix langchain-ai/langchain

# Pack specific files from a repo
/matrix:repomix facebook/react --include "packages/react/**/*.js"

# Pack with compression (signatures only)
/matrix:repomix prisma/prisma --compress

# Pack a local directory
/matrix:repomix ./my-project --include "src/**/*.ts"

# Pack a specific branch
/matrix:repomix vercel/next.js --branch canary
```

## Output

Returns packed repository content with:
- File tree structure
- Source code with file paths
- Token count statistics
- Truncation notice if output exceeded limits

## Tips

- Use `--include` to focus on relevant directories
- Use `--compress` for large repos to get more files
- Results are cached for 1 hour
- For documentation, use Context7 instead (`/context7`)
