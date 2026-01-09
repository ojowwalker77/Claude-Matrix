# Feature Proposal: Greptile-Proof Code Review System

**Proposal ID:** MATRIX-002
**Author:** Claude Matrix Team
**Status:** Draft
**Created:** 2025-01-09
**Last Updated:** 2025-01-09
**Codename:** "Greptile-Proof" / "Matrix Review"

---

## Executive Summary

This proposal introduces a **multi-phase, context-aware code review system** for Claude Matrix that addresses the fundamental limitations of current LLM-based code review. Our research reveals why tools like Greptile achieve 82% bug catch rates while Claude Code achieves ~38% on the same benchmarks: **context depth, blast radius analysis, and adaptive learning**.

Matrix is uniquely positioned to build a superior solution by leveraging its existing capabilities:
- **Tree-sitter code index** for blast radius calculation
- **Semantic embeddings** for context retrieval
- **Memory system** for learning from past reviews
- **Failure tracking** for preventing recurring issues

**Target:** Match or exceed Greptile's 82% bug catch rate while being fully local and integrated with Claude Code.

---

## Table of Contents

1. [The Problem: Why Claude Misses Bugs](#the-problem-why-claude-misses-bugs)
2. [Research: How Greptile Achieves 82%](#research-how-greptile-achieves-82)
3. [Analysis: Claude Code's Current Approach](#analysis-claude-codes-current-approach)
4. [The Gap: What's Missing](#the-gap-whats-missing)
5. [Proposed Solution: Matrix Review](#proposed-solution-matrix-review)
6. [Technical Architecture](#technical-architecture)
7. [Implementation Phases](#implementation-phases)
8. [Success Metrics](#success-metrics)
9. [Appendix: Research Sources](#appendix-research-sources)

---

## The Problem: Why Claude Misses Bugs

### The Benchmark Reality

In July 2025 benchmarks on 50 real-world bug-fix PRs across 5 open-source repositories:

| Tool | Bug Catch Rate |
|------|----------------|
| **Greptile v3** | **82%** |
| Cursor | 58% |
| GitHub Copilot | 54% |
| CodeRabbit | 44% |
| Claude Code | ~38%* |
| Graphite | 6% |

*Estimated from Baz.co benchmark showing 3/8 bugs caught.

### The User's Observation

> "Greptile finds a LOT of issues that SOTA Claude Opus 4.5 forgets"

This is not a model capability issue. Claude Opus 4.5 is likely more capable than Greptile's underlying models. **The difference is architecture, not intelligence.**

### The Fundamental Issue

Current LLM code review treats PRs as **isolated documents**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                  TYPICAL LLM CODE REVIEW                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   INPUT: Git diff (changed lines only)                             │
│      +                                                              │
│   Maybe: A few nearby lines of context                             │
│      +                                                              │
│   Maybe: CLAUDE.md guidelines                                       │
│                                                                     │
│                         ↓                                           │
│                                                                     │
│   LLM: "This looks fine based on what I can see"                   │
│                                                                     │
│                         ↓                                           │
│                                                                     │
│   REALITY: The bug is in how this change interacts with            │
│            code 3 files away that the LLM never saw                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Bugs don't live in diffs. Bugs live in interactions.**

---

## Research: How Greptile Achieves 82%

### Core Architecture Insights

Based on extensive research of Greptile's public documentation, blog posts, and technical articles:

#### 1. Knowledge Graph of Entire Codebase

> "Greptile builds a graph of your entire repository to understand how changes affect the whole system."

Unlike diff-only review:
- Indexes every function, class, and dependency
- Maps relationships between components
- Understands data flow across the codebase
- Tracks historical changes and patterns

#### 2. Blast Radius Calculation

> "The system parses the syntax tree to understand function and class connections. It calculates the 'blast radius of the diff' by recursively tracing all function calls, where the code is called, imports, and semantically similar code."

This means when you change `function A`:
- Find all callers of `A` (who depends on this?)
- Find all callees of `A` (what does this depend on?)
- Find imports and exports
- Find semantically similar code (pattern matching)
- Provide ALL of this context to the LLM

#### 3. Semantic Indexing via Embeddings

> "They built a system to translate all the code to English to extract its semantic meaning for indexing."

- Natural language descriptions of code functionality
- Enables semantic search ("find code that handles authentication")
- Links related concepts across the codebase

#### 4. Embedding-Based Quality Filtering

Greptile faced a problem: 79% of AI comments were "nits" (technically correct but not actionable).

**Solution:** Vector embeddings with team-level personalization:

```
1. Generate embeddings for upvoted/downvoted comments
2. Store in vector database partitioned by team
3. When generating new comments:
   - Compute embedding
   - If similar to 3+ downvoted examples → filter out
   - If similar to 3+ upvoted examples → keep
```

**Result:** Address rate improved from 19% to 55%+ (3x improvement).

#### 5. Independent Review Philosophy

> "Independence guards against two risks: shared assumptions that miss the same issues, and incentives that make a reviewer go easier on its own agent's output."

Greptile is **review-only** - it never generates code. This separation ensures:
- No self-review bias
- Different "perspective" than the code generator
- Focus on catching issues, not defending choices

#### 6. Iterative Improvement

- Re-scans after PR updates
- Learns from thumbs up/down feedback (2-3 weeks to calibrate)
- Team-specific quality standards

### The Formula

```
Greptile's Effectiveness =
  Knowledge Graph (understand the whole)
  × Blast Radius (find affected code)
  × Embeddings (semantic retrieval)
  × Feedback Loop (learn quality)
  × Independence (no self-review bias)
```

---

## Analysis: Claude Code's Current Approach

### Code Review Plugin Architecture

From `/plugins/code-review/`:

```
┌─────────────────────────────────────────────────────────────────────┐
│              CLAUDE CODE REVIEW PLUGIN FLOW                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Step 1: Pre-check (Haiku agent)                                   │
│          - Is PR closed/draft/trivial?                             │
│          - Already reviewed?                                        │
│                                                                     │
│  Step 2: Gather CLAUDE.md files (Haiku agent)                      │
│                                                                     │
│  Step 3: Summarize PR changes (Sonnet agent)                       │
│                                                                     │
│  Step 4: Launch 4 PARALLEL review agents:                          │
│          ┌──────────────────────────────────────────────┐          │
│          │ Agent 1: CLAUDE.md compliance (Sonnet)       │          │
│          │ Agent 2: CLAUDE.md compliance (Sonnet)       │          │
│          │ Agent 3: Obvious bugs in diff (Opus)         │          │
│          │ Agent 4: Logic/security issues (Opus)        │          │
│          └──────────────────────────────────────────────┘          │
│                                                                     │
│  Step 5: Validate each issue (parallel sub-agents)                 │
│          - Opus for bugs, Sonnet for CLAUDE.md                     │
│                                                                     │
│  Step 6: Filter by validation                                       │
│                                                                     │
│  Step 7: Post inline comments with suggestions                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### What Claude Code Does Well

1. **Multi-agent parallelism** - Different perspectives simultaneously
2. **Validation step** - Each issue gets verified before posting
3. **Confidence filtering** - Only high-signal issues posted
4. **Specialized agents** - PR-review-toolkit has 6 focused reviewers:
   - `comment-analyzer` (documentation accuracy)
   - `pr-test-analyzer` (test coverage)
   - `silent-failure-hunter` (error handling)
   - `type-design-analyzer` (type quality)
   - `code-reviewer` (general quality)
   - `code-simplifier` (complexity reduction)

### What Claude Code Lacks

| Capability | Greptile | Claude Code |
|------------|----------|-------------|
| Full codebase graph | Yes | No |
| Blast radius calculation | Yes | No |
| Semantic embeddings | Yes | No |
| Cross-file context | Full | Limited (git blame) |
| Learning from feedback | Yes (embeddings) | No |
| Team-specific calibration | Yes | No |
| Historical pattern analysis | Yes | Minimal |

---

## The Gap: What's Missing

### The Critical Difference

**Greptile asks:** "How does this change affect the entire system?"

**Claude Code asks:** "Does this diff look correct in isolation?"

### Specific Failure Modes

#### 1. Cross-Service Schema Mismatch

```typescript
// PR changes API response
// api/users.ts
return { user_id: user.id, name: user.name };
//      ^^^^^^^ Changed from "id" to "user_id"

// Frontend code (NOT in diff, NOT seen by Claude)
// components/UserProfile.tsx
const profile = await fetchUser(id);
console.log(profile.id);  // ← WILL BREAK, Claude doesn't see this
```

**Claude:** "Looks fine, field renamed consistently in the API file."
**Greptile:** "WARNING: 3 frontend components reference `profile.id` which no longer exists."

#### 2. Integration Contract Violations

```python
# PR adds new required parameter
# services/payment.py
def process_payment(amount, currency, customer_id):  # Added customer_id
    ...

# Callers (NOT in diff)
# handlers/checkout.py
process_payment(cart.total, "USD")  # ← Missing customer_id, will crash
```

**Claude:** "Function signature looks reasonable."
**Greptile:** "CRITICAL: 5 callers of process_payment() don't provide customer_id."

#### 3. Semantic Similarity Bugs

```go
// PR fixes bug in one function
// utils/sanitize.go
func SanitizeInput(s string) string {
    return strings.ReplaceAll(s, "<", "&lt;")  // Fixed XSS
}

// Similar function elsewhere (NOT in diff)
// legacy/helpers.go
func CleanInput(s string) string {
    return s  // ← Same bug exists here, Claude doesn't know
}
```

**Claude:** "Good XSS fix."
**Greptile:** "NOTE: Similar function `CleanInput` in legacy/helpers.go may have the same vulnerability."

---

## Proposed Solution: Matrix Review

### Vision

Build a code review system that leverages Matrix's existing infrastructure to match Greptile's context-awareness while remaining fully local and integrated with Claude Code.

### Core Insight: Matrix Already Has the Pieces

| Greptile Capability | Matrix Equivalent |
|---------------------|-------------------|
| Knowledge graph | Tree-sitter code index (15 languages) |
| Semantic embeddings | Local embeddings with transformers.js |
| Learning from feedback | matrix_reward / matrix_failure |
| Pattern storage | matrix_store solutions |
| Historical context | Repository fingerprinting |

**We don't need to build Greptile. We need to wire Matrix's existing capabilities into a review pipeline.**

### Architecture: Five-Phase Agentic Review

Inspired by [Baz.co's architecture](https://baz.co/resources/engineering-intuition-at-scale-the-architecture-of-agentic-code-review) which achieved 7/8 bugs vs Claude Code's 3/8:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MATRIX REVIEW ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PHASE 1: CONTEXT MAPPING                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • Parse diff to identify changed functions/classes           │   │
│  │ • Use matrix_find_definition to locate affected symbols      │   │
│  │ • Use matrix_search_symbols to find callers/callees         │   │
│  │ • Calculate blast radius (all affected files)                │   │
│  │ • Retrieve CLAUDE.md guidelines for affected paths           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  PHASE 2: INTENT INFERENCE                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • Extract author goals from PR title, description, commits  │   │
│  │ • Use matrix_recall to find similar past changes            │   │
│  │ • Identify what the change is trying to accomplish          │   │
│  │ • Note any constraints or requirements mentioned            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  PHASE 3: SOCRATIC QUESTIONING                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • Generate probing questions about the change:               │   │
│  │   - "What happens if the list is empty?"                    │   │
│  │   - "Are all consumers updated for this API change?"        │   │
│  │   - "Does this handle the error case?"                      │   │
│  │ • Each question becomes an investigation target             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  PHASE 4: TARGETED INVESTIGATION                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • Spawn PARALLEL sub-agents, each investigating one risk:   │   │
│  │                                                              │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │   │
│  │   │ API Compat  │  │ Error       │  │ Test        │        │   │
│  │   │ Checker     │  │ Handling    │  │ Coverage    │        │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘        │   │
│  │                                                              │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │   │
│  │   │ Security    │  │ Type        │  │ Performance │        │   │
│  │   │ Scanner     │  │ Checker     │  │ Analyzer    │        │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘        │   │
│  │                                                              │   │
│  │ • Each agent traverses repo to prove/disprove ONE risk      │   │
│  │ • Agents use Matrix tools for context retrieval             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  PHASE 5: REFLECTION & CONSOLIDATION                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • Aggregate findings from all investigators                  │   │
│  │ • Use matrix_recall to check for known false positives       │   │
│  │ • Filter low-confidence issues                               │   │
│  │ • Rank by severity and impact                                │   │
│  │ • Generate final review with evidence                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  OUTPUT: Actionable review with file:line references               │
│                                                                     │
│  POST-REVIEW LEARNING:                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • On thumbs up: matrix_reward(issue, "success")             │   │
│  │ • On thumbs down: matrix_reward(issue, "failure")           │   │
│  │ • On fix confirmed: matrix_store(pattern, solution)         │   │
│  │ • Store embeddings of good/bad comments for filtering       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

### Phase 1: Context Mapping

```typescript
interface BlastRadiusResult {
  changedSymbols: Symbol[];      // Functions/classes modified in diff
  directCallers: Symbol[];       // Who calls the changed code
  directCallees: Symbol[];       // What the changed code calls
  transitiveCallers: Symbol[];   // Callers of callers (depth 2)
  semanticallySimilar: Symbol[]; // Code with similar patterns
  affectedTests: string[];       // Test files that may need updating
  affectedDocs: string[];        // Documentation that may be stale
}

async function calculateBlastRadius(diff: ParsedDiff): Promise<BlastRadiusResult> {
  const changedSymbols = extractSymbolsFromDiff(diff);

  const results = await Promise.all(changedSymbols.map(async (symbol) => {
    // Use Matrix's existing code index
    const definition = await matrixFindDefinition(symbol.name);
    const references = await matrixSearchSymbols(symbol.name);
    const imports = await matrixGetImports(definition.file);
    const exports = await matrixListExports(definition.file);

    return {
      symbol,
      callers: references.filter(r => r.type === 'call'),
      callees: await traceCallees(definition),
      similar: await findSemanticallySimilar(symbol),
    };
  }));

  return aggregateBlastRadius(results);
}
```

### Phase 2: Intent Inference

```typescript
interface PRIntent {
  summary: string;
  goals: string[];
  constraints: string[];
  relatedIssues: string[];
  pastSimilarChanges: MatrixSolution[];
}

async function inferIntent(pr: PullRequest): Promise<PRIntent> {
  // Extract from PR metadata
  const metadata = await extractPRMetadata(pr);

  // Find similar past changes using Matrix memory
  const similar = await matrixRecall({
    query: `${pr.title} ${pr.description}`,
    categoryFilter: 'feature',
    limit: 5,
  });

  // Check for related failures
  const relatedFailures = await matrixRecall({
    query: metadata.affectedFiles.join(' '),
    categoryFilter: 'bugfix',
    limit: 3,
  });

  return {
    summary: metadata.title,
    goals: extractGoals(metadata),
    constraints: extractConstraints(metadata),
    relatedIssues: metadata.linkedIssues,
    pastSimilarChanges: [...similar, ...relatedFailures],
  };
}
```

### Phase 3: Socratic Questioning

```typescript
interface InvestigationQuestion {
  question: string;
  risk: 'api_compat' | 'error_handling' | 'security' | 'performance' | 'test_coverage';
  targetSymbols: Symbol[];
  evidence: string;
}

function generateQuestions(
  blastRadius: BlastRadiusResult,
  intent: PRIntent
): InvestigationQuestion[] {
  const questions: InvestigationQuestion[] = [];

  // API Compatibility
  if (blastRadius.directCallers.length > 0) {
    questions.push({
      question: `Are all ${blastRadius.directCallers.length} callers updated for this API change?`,
      risk: 'api_compat',
      targetSymbols: blastRadius.directCallers,
      evidence: `Found callers in: ${blastRadius.directCallers.map(c => c.file).join(', ')}`,
    });
  }

  // Error Handling
  const errorPatterns = detectErrorPatterns(blastRadius.changedSymbols);
  if (errorPatterns.hasTryCatch || errorPatterns.hasPromise) {
    questions.push({
      question: 'Are all error cases properly handled and surfaced to users?',
      risk: 'error_handling',
      targetSymbols: errorPatterns.symbols,
      evidence: `Error handling code detected at ${errorPatterns.locations.join(', ')}`,
    });
  }

  // Security (from Matrix warnings)
  const securityWarnings = await matrixWarnCheck({
    type: 'file',
    target: blastRadius.changedSymbols.map(s => s.file),
  });
  if (securityWarnings.length > 0) {
    questions.push({
      question: 'Does this change introduce or exacerbate known security concerns?',
      risk: 'security',
      targetSymbols: blastRadius.changedSymbols,
      evidence: securityWarnings.map(w => w.reason).join('; '),
    });
  }

  // Test Coverage
  if (blastRadius.affectedTests.length === 0) {
    questions.push({
      question: 'Are there tests covering this changed functionality?',
      risk: 'test_coverage',
      targetSymbols: blastRadius.changedSymbols,
      evidence: 'No test files found in blast radius',
    });
  }

  return questions;
}
```

### Phase 4: Targeted Investigation

```typescript
interface InvestigationResult {
  question: InvestigationQuestion;
  findings: Finding[];
  verdict: 'issue_found' | 'no_issue' | 'inconclusive';
  confidence: number;  // 0-100
  evidence: string[];
}

async function investigate(
  question: InvestigationQuestion,
  context: ReviewContext
): Promise<InvestigationResult> {
  // Each investigation is an independent sub-agent
  const agent = createInvestigationAgent(question.risk);

  // Provide focused context to the agent
  const focusedContext = {
    symbols: question.targetSymbols,
    files: await readFiles(question.targetSymbols.map(s => s.file)),
    guidelines: context.claudeMd,
    pastIssues: await matrixRecall({
      query: question.question,
      categoryFilter: 'bugfix',
      limit: 3,
    }),
  };

  // Agent investigates and returns structured findings
  return await agent.investigate(question, focusedContext);
}

// Run all investigations in parallel
async function runInvestigations(
  questions: InvestigationQuestion[],
  context: ReviewContext
): Promise<InvestigationResult[]> {
  return Promise.all(questions.map(q => investigate(q, context)));
}
```

### Phase 5: Reflection & Consolidation

```typescript
interface ReviewOutput {
  summary: string;
  issues: ReviewIssue[];
  positiveNotes: string[];
  suggestedFollowups: string[];
}

async function consolidate(
  investigations: InvestigationResult[],
  context: ReviewContext
): Promise<ReviewOutput> {
  // Filter by confidence
  const highConfidence = investigations.filter(i =>
    i.verdict === 'issue_found' && i.confidence >= 80
  );

  // Check against known false positives
  const filtered = await Promise.all(highConfidence.map(async (issue) => {
    const similarFalsePositives = await matrixRecall({
      query: issue.findings[0].description,
      scopeFilter: 'repo',
      limit: 3,
    });

    // If similar issues were previously marked as false positives, skip
    const isFalsePositive = similarFalsePositives.some(fp =>
      fp.tags?.includes('false-positive') &&
      calculateSimilarity(fp, issue) > 0.85
    );

    return isFalsePositive ? null : issue;
  }));

  // Rank by severity
  const ranked = filtered
    .filter(Boolean)
    .sort((a, b) => severityScore(b) - severityScore(a));

  return formatReview(ranked, context);
}
```

### Learning Loop

```typescript
// Called when user provides feedback on a review comment
async function onReviewFeedback(
  issue: ReviewIssue,
  feedback: 'helpful' | 'not_helpful' | 'false_positive'
): Promise<void> {
  if (feedback === 'helpful') {
    // Store as successful pattern
    await matrixStore({
      problem: issue.description,
      solution: issue.suggestion,
      category: 'pattern',
      scope: 'repo',
      tags: ['code-review', issue.risk],
    });

    // Reward the investigation approach
    await matrixReward({
      solutionId: issue.investigationId,
      outcome: 'success',
      notes: 'Review comment was helpful',
    });
  } else if (feedback === 'false_positive') {
    // Record as false positive to avoid in future
    await matrixStore({
      problem: issue.description,
      solution: 'FALSE POSITIVE - do not flag',
      category: 'pattern',
      scope: 'repo',
      tags: ['code-review', 'false-positive', issue.risk],
    });

    await matrixReward({
      solutionId: issue.investigationId,
      outcome: 'failure',
      notes: 'False positive - should not have flagged',
    });
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal:** Blast radius calculation using Matrix index

- [ ] Implement `calculateBlastRadius()` using existing Matrix tools
- [ ] Add `matrix_find_callers` tool (inverse of find_definition)
- [ ] Add `matrix_trace_dependencies` tool (transitive closure)
- [ ] Create `/matrix:review-context` command to visualize blast radius
- [ ] Unit tests for context gathering

**Deliverable:** When you change `function foo()`, Matrix can list all callers, callees, and related code.

### Phase 2: Multi-Agent Pipeline (Week 3-4)

**Goal:** Five-phase review architecture

- [ ] Implement Phase 1-5 pipeline as described above
- [ ] Create specialized investigation agents:
  - `api-compat-investigator`
  - `error-handling-investigator`
  - `security-investigator`
  - `test-coverage-investigator`
  - `type-safety-investigator`
- [ ] Parallel execution of Phase 4 investigators
- [ ] Consolidation logic with confidence scoring

**Deliverable:** `/matrix:review` command that runs full pipeline.

### Phase 3: Learning Loop (Week 5-6)

**Goal:** Adaptive quality improvement

- [ ] Integrate feedback collection (thumbs up/down on comments)
- [ ] Store comment embeddings for similarity filtering
- [ ] Implement false positive detection using Matrix memory
- [ ] Team-specific calibration via repository fingerprinting
- [ ] Track address rate (% of comments that get addressed)

**Deliverable:** Review quality improves over time based on feedback.

### Phase 4: Integration & Polish (Week 7-8)

**Goal:** Production-ready integration

- [ ] GitHub integration via `gh` CLI
- [ ] Inline comment posting with suggestions
- [ ] CI/CD webhook support
- [ ] Performance optimization (parallel execution, caching)
- [ ] Documentation and examples

**Deliverable:** Drop-in replacement for `/code-review` with superior bug detection.

---

## Success Metrics

### Primary Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Bug catch rate | ≥75% | Test against Greptile's 50-PR benchmark |
| False positive rate | <20% | % of comments marked "not helpful" |
| Address rate | ≥50% | % of comments that result in code changes |
| Review latency | <3 min | Time from PR to review comment |

### Secondary Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Context retrieval accuracy | ≥90% | Blast radius includes all affected code |
| Learning improvement | +10%/month | Address rate improvement over time |
| User satisfaction | ≥4/5 | Survey of active users |

### Benchmark Protocol

To validate against Greptile:

1. Use the same 50 bug-fix PRs from Greptile's public benchmark
2. Create fresh forks for each test
3. Measure: Did Matrix identify the bug before the fix was applied?
4. Count as "caught" only if Matrix provides line-level comment explaining the issue

---

## Risk Analysis

### Technical Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Blast radius too large | Medium | Configurable depth limit, prioritization |
| Index out of date | Low | Incremental re-indexing on file change |
| Investigation too slow | Medium | Parallel execution, caching, Haiku for simple checks |
| False positives frustrate users | High | Aggressive filtering, learning loop, confidence thresholds |

### Product Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Overlap with Claude Code plugin | High | Position as enhancement, not replacement |
| Complex setup required | Medium | Default configuration, zero-config mode |
| Privacy concerns (sending code) | Low | Fully local, no external API calls |

---

## Comparison: Matrix Review vs Alternatives

| Capability | Greptile | Claude Code | Matrix Review |
|------------|----------|-------------|---------------|
| Full codebase context | Yes (cloud) | No | Yes (local) |
| Blast radius | Yes | No | Yes |
| Multi-agent | Unknown | Yes (4 agents) | Yes (6+ agents) |
| Learning from feedback | Yes | No | Yes |
| Privacy (local) | No | Yes | Yes |
| Cost | $$$/month | Included | Included |
| Customizable | Limited | Yes | Yes |
| Open source | No | Partial | Yes |

**Matrix Review's unique advantages:**
1. **Fully local** - No code leaves your machine
2. **Integrated with Matrix memory** - Learns from all past work
3. **Open source** - Full customization possible
4. **No additional cost** - Uses existing Claude Code subscription

---

## Appendix: Research Sources

### Greptile Documentation & Blog
- [AI Code Reviews: The Ultimate Guide](https://www.greptile.com/what-is-ai-code-review) - Core methodology
- [AI Code Review Benchmarks 2025](https://www.greptile.com/benchmarks) - 82% bug catch rate
- [Series A and Greptile v3](https://www.greptile.com/blog/series-a) - Architecture rewrite
- [Greptile Introduction](https://www.greptile.com/docs/introduction) - Technical overview

### ZenML LLMOps Database
- [Improving AI Code Review Bot Comment Quality Through Vector Embeddings](https://www.zenml.io/llmops-database/improving-ai-code-review-bot-comment-quality-through-vector-embeddings) - Embedding-based filtering (19% → 55% address rate)

### Baz.co Architecture
- [The Architecture of Agentic Code Review](https://baz.co/resources/engineering-intuition-at-scale-the-architecture-of-agentic-code-review) - Five-phase approach (7/8 vs Claude's 3/8)

### Google Developers Blog
- [Developer's Guide to Multi-Agent Patterns in ADK](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/) - Parallel agent patterns

### Claude Code Plugins
- `/plugins/code-review/` - Current 4-agent approach
- `/plugins/pr-review-toolkit/` - 6 specialized review agents

---

## Conclusion

The gap between Greptile (82%) and Claude Code (~38%) is not about model capability - it's about **architecture**. Greptile's success comes from:

1. Understanding the **whole codebase**, not just the diff
2. Calculating **blast radius** to find affected code
3. **Learning from feedback** to reduce false positives
4. **Independent review** separated from code generation

Matrix is uniquely positioned to close this gap because it already has:
- Code indexing (tree-sitter, 15 languages)
- Semantic embeddings (transformers.js)
- Memory system (matrix_store, matrix_recall)
- Feedback tracking (matrix_reward, matrix_failure)

We're not building Greptile. We're **wiring Matrix's existing capabilities into a review pipeline** that matches or exceeds Greptile's effectiveness while remaining fully local, private, and integrated with Claude Code.

---

**Decision:** Implement Matrix Review as described in this proposal.

**Next Steps:**
1. Review with stakeholders
2. Prioritize phases based on available resources
3. Begin Phase 1 implementation
