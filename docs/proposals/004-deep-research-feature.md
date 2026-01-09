# Feature Proposal: Deep Research Feature

**Proposal ID:** MATRIX-004
**Author:** Claude Matrix Team
**Status:** Draft
**Created:** 2025-01-09
**Type:** New Feature

---

## Executive Summary

Introduce `/matrix:deep-research`, a multi-phase research aggregation tool that combines web search, documentation lookup, Matrix memory, and external repository analysis into comprehensive, well-structured research documents.

**Vision:** When a user needs to deeply understand a topic, Matrix should orchestrate multiple information sources and produce a polished research document - not just scattered search results.

---

## Problem Statement

### Current Research Workflow

When users need to research a topic, they manually:

1. Run multiple `WebSearch` queries
2. `WebFetch` promising URLs one by one
3. Query `Context7` for library docs
4. Check `matrix_recall` for past solutions
5. Maybe use `matrix_repomix` for reference implementations
6. Mentally synthesize everything
7. Manually write up findings

**Problems:**
- Tedious and time-consuming
- Easy to miss important sources
- No structured output
- Results scattered across conversation
- No reusable artifact

### What Users Actually Want

> "Research X deeply and give me a comprehensive document I can reference later"

---

## Proposed Solution

### `/matrix:deep-research`

A five-phase research pipeline that produces a polished markdown document.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      MATRIX DEEP RESEARCH                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  INPUT: Theme + optional parameters                                 │
│                                                                     │
│  ═══════════════════════════════════════════════════════════════   │
│                                                                     │
│  PHASE 1: QUERY EXPANSION                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • Analyze theme to identify subtopics                        │   │
│  │ • Generate 5-10 related search queries                       │   │
│  │ • Identify relevant libraries/frameworks                     │   │
│  │ • Use Haiku for speed                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  PHASE 2: MULTI-SOURCE GATHERING (Parallel)                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │   │
│  │ │ WebSearch   │  │ Context7    │  │ matrix_     │          │   │
│  │ │ (5-10       │  │ (library    │  │ recall      │          │   │
│  │ │ queries)    │  │ docs)       │  │ (past work) │          │   │
│  │ └─────────────┘  └─────────────┘  └─────────────┘          │   │
│  │                                                              │   │
│  │ ┌─────────────┐  ┌─────────────┐                            │   │
│  │ │ matrix_     │  │ GitHub      │                            │   │
│  │ │ repomix     │  │ (if code-   │                            │   │
│  │ │ (ref impl)  │  │ related)    │                            │   │
│  │ └─────────────┘  └─────────────┘                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  PHASE 3: CONTENT FETCHING                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • WebFetch top N URLs from search results                    │   │
│  │ • Extract key content, filter noise                          │   │
│  │ • Deduplicate overlapping information                        │   │
│  │ • Parallel fetching for speed                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  PHASE 4: SYNTHESIS                                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • Aggregate all gathered content                             │   │
│  │ • Identify themes and organize by subtopic                   │   │
│  │ • Extract code examples and best practices                   │   │
│  │ • Note contradictions and caveats                            │   │
│  │ • Generate executive summary                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  PHASE 5: OUTPUT                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • Format as structured markdown document                     │   │
│  │ • Save to ~/Downloads/Matrix Deep Research - {theme}.md     │   │
│  │ • Display summary in conversation                            │   │
│  │ • Optionally store key findings in Matrix memory             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technical Design

### Command Interface

```typescript
interface DeepResearchInput {
  theme: string;           // Required - the topic to research

  depth?: 'quick' | 'standard' | 'exhaustive';
  // quick: 3-5 sources, ~2 min
  // standard: 10-15 sources, ~5 min (default)
  // exhaustive: 20-30 sources, ~10 min

  focusAreas?: string[];   // Optional subtopics to prioritize
  includeCode?: boolean;   // Include code examples (default: true)
  maxSources?: number;     // Override default source count
  outputPath?: string;     // Custom output path
  storeInMemory?: boolean; // Store key findings in Matrix (default: false)
}
```

### Usage Examples

```bash
# Basic usage
/matrix:deep-research "WebSocket authentication best practices"

# Quick research
/matrix:deep-research "React Server Components" --depth quick

# Exhaustive with focus areas
/matrix:deep-research "Kubernetes autoscaling" --depth exhaustive --focus "HPA,VPA,KEDA"

# Store findings for future recall
/matrix:deep-research "OAuth 2.0 PKCE flow" --store
```

---

## Output Document Structure

```markdown
# Matrix Deep Research: {Theme}

> **Generated:** {date}
> **Sources:** {count}
> **Depth:** {quick|standard|exhaustive}

---

## Executive Summary

{2-3 paragraph high-level overview of the topic, key takeaways, and when/why you'd use this}

---

## Key Findings

- **Finding 1**: {concise insight with source}
- **Finding 2**: {concise insight with source}
- **Finding 3**: {concise insight with source}
- ...

---

## Detailed Analysis

### {Subtopic 1}

{Deep analysis with inline citations}

Key points:
- Point A [Source 1]
- Point B [Source 2]

### {Subtopic 2}

{Deep analysis}

### {Subtopic 3}

{Deep analysis}

---

## Code Examples

### Example 1: {Description}

```{language}
{code from Context7 or repomix}
```

**Source:** {library/repo}

### Example 2: {Description}

```{language}
{code}
```

---

## Best Practices

1. **Practice 1**: {description} [Source]
2. **Practice 2**: {description} [Source]
3. **Practice 3**: {description} [Source]

---

## Common Pitfalls

| Pitfall | Why It's Bad | What To Do Instead |
|---------|--------------|-------------------|
| {pitfall 1} | {explanation} | {recommendation} |
| {pitfall 2} | {explanation} | {recommendation} |

---

## Comparison Table

{If applicable - comparing approaches, libraries, or methods}

| Aspect | Option A | Option B | Option C |
|--------|----------|----------|----------|
| ... | ... | ... | ... |

---

## Sources

1. [{Title}]({url}) - {brief description of what this source contributed}
2. [{Title}]({url}) - {description}
3. **Context7**: {library} - {what docs were used}
4. **Matrix Memory**: {solution ID} - {past relevant work}
5. **Repomix**: {repo} - {what was extracted}
...

---

## Further Reading

- [{Title}]({url}) - {why it's worth reading}
- [{Title}]({url}) - {why}

---

## Matrix Notes

{If --store was used}

Key findings have been stored in Matrix memory for future recall:
- Solution ID: {id} - "{summary}"
```

---

## Implementation

### Phase 1: Query Expansion

```typescript
async function expandQueries(theme: string, depth: Depth): Promise<ExpandedQueries> {
  // Use Haiku for speed
  const expansion = await runHaikuAgent(`
    Analyze this research theme and generate search queries:
    Theme: "${theme}"

    Generate:
    1. 5-10 related search queries (more for exhaustive depth)
    2. Key subtopics to cover
    3. Relevant libraries/frameworks to look up
    4. Potential reference repositories

    Format as JSON.
  `);

  return {
    webQueries: expansion.searchQueries,
    subtopics: expansion.subtopics,
    libraries: expansion.libraries,
    repos: expansion.repos,
  };
}
```

### Phase 2: Multi-Source Gathering

```typescript
async function gatherSources(queries: ExpandedQueries): Promise<GatheredSources> {
  // Run all sources in parallel
  const [
    webResults,
    docsResults,
    memoryResults,
    repoResults,
  ] = await Promise.all([
    // Web search - multiple queries
    Promise.all(queries.webQueries.map(q => webSearch(q))),

    // Context7 - library docs
    Promise.all(queries.libraries.map(async lib => {
      const resolved = await resolveLibraryId(lib);
      if (resolved) {
        return queryDocs(resolved.libraryId, queries.theme);
      }
      return null;
    })),

    // Matrix memory - past solutions
    matrixRecall({
      query: queries.theme,
      limit: 5,
    }),

    // Repomix - reference implementations (Phase 1 only - suggestions)
    Promise.all(queries.repos.slice(0, 3).map(repo =>
      matrixRepomix({
        target: repo,
        query: queries.theme,
        maxFiles: 10,
      })
    )),
  ]);

  return {
    web: webResults.flat(),
    docs: docsResults.filter(Boolean),
    memory: memoryResults,
    repos: repoResults,
  };
}
```

### Phase 3: Content Fetching

```typescript
async function fetchContent(
  sources: GatheredSources,
  maxSources: number
): Promise<FetchedContent[]> {
  // Rank and select top URLs
  const topUrls = rankUrls(sources.web, maxSources);

  // Fetch in parallel with rate limiting
  const fetched = await Promise.all(
    topUrls.map(url => webFetch(url, {
      prompt: 'Extract the key information relevant to the research topic',
    }))
  );

  return fetched.filter(Boolean);
}
```

### Phase 4: Synthesis

```typescript
async function synthesize(
  theme: string,
  content: FetchedContent[],
  docs: DocsResult[],
  memory: MatrixSolution[],
  subtopics: string[]
): Promise<SynthesizedDocument> {
  // Use Sonnet for quality synthesis
  return await runSonnetAgent(`
    Synthesize this research into a comprehensive document.

    Theme: ${theme}
    Subtopics to cover: ${subtopics.join(', ')}

    Web Content:
    ${content.map(c => c.summary).join('\n\n')}

    Library Documentation:
    ${docs.map(d => d.content).join('\n\n')}

    Past Solutions (Matrix Memory):
    ${memory.map(m => `${m.problem}: ${m.solution}`).join('\n\n')}

    Create a structured document with:
    - Executive summary
    - Key findings (bullet points)
    - Detailed analysis by subtopic
    - Code examples
    - Best practices
    - Common pitfalls
    - Sources cited
  `);
}
```

### Phase 5: Output

```typescript
async function outputDocument(
  synthesized: SynthesizedDocument,
  input: DeepResearchInput
): Promise<OutputResult> {
  // Format as markdown
  const markdown = formatAsMarkdown(synthesized, input);

  // Determine output path
  const filename = `Matrix Deep Research - ${sanitize(input.theme)}.md`;
  const outputPath = input.outputPath ?? join(homedir(), 'Downloads', filename);

  // Write file
  await writeFile(outputPath, markdown);

  // Optionally store in Matrix memory
  if (input.storeInMemory) {
    await matrixStore({
      problem: `Research: ${input.theme}`,
      solution: synthesized.executiveSummary,
      category: 'pattern',
      scope: 'global',
      tags: ['research', ...synthesized.subtopics],
    });
  }

  return {
    path: outputPath,
    summary: synthesized.executiveSummary,
    sourceCount: synthesized.sources.length,
  };
}
```

---

## Depth Levels

| Depth | Web Queries | Max Sources | Context7 | Repomix | Time |
|-------|-------------|-------------|----------|---------|------|
| quick | 3-5 | 5 | 1 library | No | ~2 min |
| standard | 5-8 | 15 | 2-3 libraries | 1 repo | ~5 min |
| exhaustive | 8-12 | 30 | 5+ libraries | 3 repos | ~10 min |

---

## Integration with Existing Matrix Features

### matrix_recall

- Query past solutions related to the research theme
- Include relevant past work in the document
- Avoid re-researching topics Matrix already knows

### matrix_repomix

- Fetch reference implementations from GitHub
- Extract relevant code patterns
- Include as code examples in output

### Context7

- Get official library documentation
- Include authoritative best practices
- Cite specific documentation sections

### matrix_store (optional)

- Store key findings for future recall
- Build institutional knowledge over time
- Enable `/matrix:recall "research on X"`

---

## Command File

```markdown
---
description: Deep research on any topic with multi-source synthesis
argument-hint: Theme to research (e.g., "WebSocket authentication")
allowed-tools: [
  "WebSearch", "WebFetch", "Read", "Write",
  "mcp__plugin_matrix_matrix__matrix_recall",
  "mcp__plugin_matrix_matrix__matrix_store",
  "mcp__plugin_matrix_matrix__matrix_repomix",
  "mcp__plugin_matrix_context7__resolve-library-id",
  "mcp__plugin_matrix_context7__query-docs",
  "Task", "TodoWrite"
]
---

# Matrix Deep Research

Research "$ARGUMENTS" comprehensively using multiple sources.

## Parameters

Parse from $ARGUMENTS:
- `--depth {quick|standard|exhaustive}` - Research depth (default: standard)
- `--focus {areas}` - Comma-separated focus areas
- `--no-code` - Skip code examples
- `--store` - Store key findings in Matrix memory

## Process

Use TodoWrite to track progress through 5 phases:

### Phase 1: Query Expansion
{instructions}

### Phase 2: Multi-Source Gathering
{instructions}

### Phase 3: Content Fetching
{instructions}

### Phase 4: Synthesis
{instructions}

### Phase 5: Output
{instructions}

## Output

Save to: ~/Downloads/Matrix Deep Research - {theme}.md
Display summary in conversation.
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| User satisfaction | 4+/5 | Post-research survey |
| Source diversity | 3+ source types | Count distinct sources |
| Document completeness | All sections filled | Automated check |
| Research time (standard) | <5 min | Timing |
| Recall accuracy | 80%+ | User finds doc useful later |

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Slow execution | Medium | Parallel fetching, depth levels |
| Low-quality sources | Low | Rank by domain authority |
| Token cost | Medium | Use Haiku where possible |
| Rate limiting | Low | Respect API limits, backoff |

---

## Implementation Plan

### Phase 1: Core Pipeline (Week 1)

- [ ] Query expansion with Haiku
- [ ] Parallel source gathering
- [ ] Content fetching with ranking
- [ ] Basic synthesis
- [ ] File output

### Phase 2: Matrix Integration (Week 2)

- [ ] matrix_recall integration
- [ ] matrix_repomix integration
- [ ] Context7 integration
- [ ] Optional matrix_store

### Phase 3: Polish (Week 3)

- [ ] Depth levels
- [ ] Focus areas
- [ ] Better document formatting
- [ ] Progress indicators

---

## Conclusion

`/matrix:deep-research` transforms Matrix from a reactive assistant into a proactive research partner. By orchestrating multiple information sources and producing polished documents, it saves users hours of manual research while ensuring comprehensive coverage.

The feature leverages Matrix's unique position as a hub connecting:
- Web search (current information)
- Context7 (authoritative docs)
- Matrix memory (past solutions)
- Repomix (reference implementations)

No other tool can combine all these sources into a unified research experience.

---

**Decision:** Implement `/matrix:deep-research` as described.

**Next Steps:**
1. Review with stakeholders
2. Prioritize implementation phases
3. Begin Phase 1 development
