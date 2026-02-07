---
name: Matrix Deep Research
description: This skill should be used when the user asks to "research a topic", "deep research", "investigate thoroughly", "multi-source research", "comprehensive analysis", or needs to conduct research across web, documentation, and memory sources.
user-invocable: true
context: fork
allowed-tools:
  - WebSearch
  - WebFetch
  - mcp__plugin_matrix_context7__resolve-library-id
  - mcp__plugin_matrix_context7__query-docs
  - mcp__plugin_matrix_matrix__matrix_recall
  - mcp__plugin_matrix_matrix__matrix_store
  - Write
  - Read
---

# Matrix Deep Research

Perform comprehensive research on a topic using multiple sources: web search, Context7 documentation, Matrix memory, GitHub repositories, and more.

## Usage

Parse user arguments from the skill invocation (text after the trigger phrase).

**Format:** `<query> [depth]`

- **query**: The research topic or question
- **depth** (optional): `quick` | `standard` | `exhaustive` (default: `standard`)

## Depth Levels

- **quick**: Fast research using 2-3 sources, ~500 words output
- **standard**: Balanced research using 4-5 sources, ~1500 words output
- **exhaustive**: Deep research using 6+ sources, ~3000+ words output

## Research Pipeline

Follow the 5-phase research pipeline detailed in `references/research-pipeline.md`:

1. **Phase 1: Query Expansion** - Analyze query, generate sub-queries, identify domains
2. **Phase 2: Multi-Source Gathering** - Collect from Web, Context7, Matrix, GitHub
3. **Phase 3: Content Fetching** - Retrieve full content from promising URLs
4. **Phase 4: Synthesis** - Deduplicate, organize, identify patterns
5. **Phase 5: Output** - Generate polished markdown report

## Output

Save to session directory: `$CLAUDE_SESSION_DIR/matrix-research-[slug]-[timestamp].md`

If `$CLAUDE_SESSION_DIR` is not available, fall back to current working directory.

After completing research:
1. Display a summary of findings in the chat
2. Report the full markdown file location
3. Offer to elaborate on any section

## Examples

```
/matrix:deep-research React Server Components best practices standard
/matrix:deep-research "how to implement OAuth 2.0 with PKCE" exhaustive
/matrix:deep-research TypeScript generics quick
```

## Additional Resources

### Reference Files

For detailed pipeline procedures, consult:
- **`references/research-pipeline.md`** - Complete 5-phase research process with output format
