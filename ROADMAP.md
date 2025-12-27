# Claude Matrix Roadmap

> **Vision**: "Claude on Rails" — Zero-friction AI development with persistent memory, parallel agents, and intelligent prompting.

---

## v1.0.2 — RELEASED

Multi-language code indexing with tree-sitter:

- [x] Tree-sitter WASM parser (replaces TypeScript Compiler API)
- [x] 10 languages: TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, Ruby, PHP
- [x] Lazy grammar loading (downloaded on first use, cached locally)
- [x] Zero bundled overhead (grammars fetched from unpkg.com)
- [x] Auto-detection for all project types

---

## v1.0.0 — RELEASED

The first stable release focuses on **Memory + Hooks + Context7**:

- [x] Core MCP tools (recall, store, reward, failure, status)
- [x] Local embeddings with transformers.js
- [x] Repository fingerprinting
- [x] Context-aware scoring
- [x] Warning system (files/packages)
- [x] Claude Code hooks (7 hooks total)
- [x] Prompt Agent with hook integration
- [x] Context7 WebFetch/WebSearch intercept
- [x] Complexity estimation
- [x] Package auditing (CVEs, deprecation)

---

## v2.0.0 Roadmap

The next major version focuses on **Worktrees & Agent Orchestration**.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLAUDE MATRIX v2.0.0                         │
├────────────────┬────────────────┬────────────────┬─────────────┤
│    MEMORY      │   WORKTREES    │    HOOKS       │   PROMPT    │
│    SYSTEM      │   & AGENTS     │    SYSTEM      │   AGENT     │
├────────────────┼────────────────┼────────────────┼─────────────┤
│ ✅ matrix_store│ matrix spawn   │ ✅ UserPrompt  │ ✅ Intercept│
│ ✅ matrix_recall│ matrix agents │ ✅ PreToolUse  │ ✅ Analyze  │
│ ✅ matrix_reward│ matrix merge  │ ✅ PostToolUse │ ✅ Clarify  │
│ ✅ matrix_failure│ matrix kill  │ ✅ Stop        │ ✅ Optimize │
│ ✅ fingerprinting│ orchestration│ ✅ Context7    │ Delegate    │
└────────────────┴────────────────┴────────────────┴─────────────┘
```

✅ = Completed in v1.0.0

---

## Pillar 1: Memory System (Enhanced)

### 1.1 Enhanced `matrix_store()` — Precision Storage

**Problem**: Current storage is too broad, solutions lack structure for precise retrieval.

**Enhancements**:

```typescript
// Current
matrix_store(problem, solution, scope, tags?, filesAffected?)

// v1.0.0 — More structured, better searchability
matrix_store({
  problem: string,
  solution: string,
  scope: 'global' | 'stack' | 'repo',

  // NEW: Structured metadata
  category?: 'bugfix' | 'feature' | 'refactor' | 'config' | 'pattern' | 'optimization',
  complexity?: 1-10,           // Auto-calculated or manual
  prerequisites?: string[],    // What must be true for this to apply
  antiPatterns?: string[],     // What NOT to do (learned from failures)

  // NEW: Code snippets as first-class citizens
  codeBlocks?: {
    language: string,
    code: string,
    description: string,
  }[],

  // NEW: Relationship linking
  relatedSolutions?: string[], // IDs of related solutions
  supersedes?: string,         // ID of solution this replaces

  // Existing
  tags?: string[],
  filesAffected?: string[],
})
```

**Benefits**:
- Better filtering: "show me all bugfixes in auth module"
- Prerequisite matching: only show solutions where prereqs are met
- Code extraction: copy-paste ready snippets
- Solution evolution: track how solutions improve over time

### 1.2 Enhanced Repo Fingerprinting — Indexed for Speed

**Problem**: Fingerprinting is computed on-demand, slow for large repos.

**Enhancements**:

```
~/.claude/matrix/
├── matrix.db              # Main database
└── indexes/
    ├── repo-{hash}.idx    # Cached fingerprint per repo
    └── manifest.json      # Index metadata + invalidation rules
```

**Features**:

| Feature | Description |
|---------|-------------|
| **Persistent Index** | Fingerprint computed once, cached to disk |
| **Incremental Update** | Watch for package.json/Cargo.toml changes, update only affected parts |
| **Dependency Graph** | Index internal imports for better context matching |
| **Pattern Detection** | Detect common patterns: monorepo, microservices, MVC, etc. |
| **Stack Signature** | Generate unique hash for quick "same stack" matching |

**Index Schema**:
```typescript
interface RepoIndex {
  repoHash: string;
  computed: Date;
  invalidateOn: string[];  // Files to watch for changes

  fingerprint: {
    languages: Record<string, number>;  // language -> line count
    frameworks: string[];
    dependencies: DependencyTree;
    patterns: string[];
    architecture: 'monorepo' | 'monolith' | 'microservice' | 'library';
  };

  embedding: Float32Array;  // Pre-computed for fast similarity

  // NEW: Internal structure
  modules: {
    path: string;
    exports: string[];
    imports: string[];
  }[];
}
```

**CLI Commands**:
```bash
matrix index                 # Index current repo
matrix index --rebuild       # Force rebuild
matrix index --status        # Show index health
matrix index --watch         # Watch mode (for development)
```

---

## Pillar 2: Subshell Worktrees & Agent Orchestration

### 2.1 Core Concept

Spawn isolated Claude instances on different branches, working in parallel without interference.

```
project/
├── .git/                    # Shared git database
├── src/                     # Main working tree (current branch)
└── .matrix/
    └── trees/
        ├── feature-auth/    # Worktree: feature/auth branch
        │   └── (full checkout)
        ├── feature-viz/     # Worktree: feature/data-viz branch
        │   └── (full checkout)
        └── hotfix-123/      # Worktree: hotfix/critical-bug branch
            └── (full checkout)
```

### 2.2 Commands

```bash
# Spawn a new agent on a branch
matrix spawn <branch-name> [options]
  --from <base>           # Branch to create from (default: current)
  --new                   # Create new branch
  --prompt "<task>"       # Initial task for the agent
  --background            # Run in background
  --memory isolated       # Don't share memory with main (default: shared)

# Examples
matrix spawn feature/auth --new --from main --prompt "implement JWT auth"
matrix spawn hotfix/bug-123 --prompt "fix the race condition in user service"
matrix spawn experiment/new-ui --background --memory isolated

# List active agents
matrix agents
# ID        BRANCH           STATUS    MEMORY     UPTIME
# a3f2c1    feature/auth     active    shared     2h 15m
# b7d4e2    feature/viz      idle      shared     45m
# c9a1f3    hotfix/123       done      shared     12m

# Interact with agent
matrix attach <id>           # Attach to agent's session
matrix logs <id>             # View agent's output
matrix prompt <id> "<msg>"   # Send message to agent

# Merge agent's work
matrix merge <id>            # Merge branch + sync memory
  --squash                   # Squash commits
  --no-memory               # Don't merge memory learnings
  --delete                  # Delete worktree after merge

# Kill agent
matrix kill <id>             # Stop agent, keep worktree
matrix kill <id> --cleanup   # Stop and remove worktree
```

### 2.3 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Matrix Orchestrator                         │
│                     (matrix daemon)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Agent 1   │  │   Agent 2   │  │   Agent 3   │             │
│  │ feature/auth│  │ feature/viz │  │ hotfix/123  │             │
│  │             │  │             │  │             │             │
│  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │             │
│  │ │ Claude  │ │  │ │ Claude  │ │  │ │ Claude  │ │             │
│  │ │ Process │ │  │ │ Process │ │  │ │ Process │ │             │
│  │ └────┬────┘ │  │ └────┬────┘ │  │ └────┬────┘ │             │
│  │      │      │  │      │      │  │      │      │             │
│  │ ┌────▼────┐ │  │ ┌────▼────┐ │  │ ┌────▼────┐ │             │
│  │ │Worktree │ │  │ │Worktree │ │  │ │Worktree │ │             │
│  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Shared Memory Layer (matrix.db)             │   │
│  │  - Solutions visible across agents (scope-aware)         │   │
│  │  - Agent can learn from other agents' solutions          │   │
│  │  - Conflict resolution on merge                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Memory Modes

| Mode | Behavior |
|------|----------|
| `shared` (default) | All agents read/write to same matrix.db. Solutions from one agent help others. |
| `isolated` | Agent gets a copy of matrix.db. Changes don't affect main. Useful for experiments. |
| `readonly` | Agent can read from main memory but can't write. Useful for analysis tasks. |

### 2.5 Orchestration Patterns

```bash
# Sequential: Run tasks in order
matrix orchestrate sequential \
  "matrix spawn prep --prompt 'set up test fixtures'" \
  "matrix spawn impl --prompt 'implement feature'" \
  "matrix spawn test --prompt 'write and run tests'"

# Parallel: Run independent tasks simultaneously
matrix orchestrate parallel \
  "matrix spawn auth --prompt 'implement auth'" \
  "matrix spawn viz --prompt 'build dashboard'" \
  "matrix spawn docs --prompt 'write API docs'"

# Fan-out/Fan-in: Parallel work then merge
matrix orchestrate fan-in \
  --parallel "auth,viz,docs" \
  --merge-to main \
  --prompt "prepare release"
```

### 2.6 Implementation Notes

**Git Worktree Management**:
```bash
# Under the hood
git worktree add .matrix/trees/feature-auth feature/auth
git worktree remove .matrix/trees/feature-auth
git worktree prune  # Clean stale references
```

**Process Management**:
- Use Bun's subprocess API (`Bun.spawn`)
- Store PIDs in `~/.claude/matrix/agents.json`
- Health check via periodic ping
- Graceful shutdown on `matrix kill`

**Resource Limits**:
- Max concurrent agents: configurable (default: 3)
- Memory per agent: ~500MB baseline + Claude overhead
- Auto-suspend idle agents after configurable timeout

---

## Pillar 3: Hooks System (Enhanced)

### 3.1 Current Hooks (v0.5.x)

| Hook | Trigger | Action |
|------|---------|--------|
| `UserPromptSubmit` | User sends message | Complexity check, memory injection |
| `PreToolUse:Bash` | Before bash command | Package auditing |
| `PreToolUse:Edit` | Before file edit | Cursed file warning |
| `PostToolUse:Bash` | After bash command | Audit trail |
| `Stop` | Session ends | Session analysis, storage prompt |

### 3.2 New Hooks for v1.0.0

| Hook | Trigger | Action |
|------|---------|--------|
| `PreToolUse:Task` | Before spawning agent | Validate task, suggest memory context |
| `PreToolUse:WebFetch` | Before web fetch | **Route through Context7 first** |
| `PreToolUse:WebSearch` | Before web search | **Route through Context7 first** |
| `PostToolUse:Task` | After agent completes | Collect learnings, merge memory |
| `SessionStart` | Claude Code starts | Load relevant context for current repo |

### 3.3 Context7 Integration

**What is Context7?**
MCP server that provides up-to-date documentation for libraries/frameworks. Instead of Claude using outdated training data or web search, Context7 provides accurate, current docs.

**Integration Strategy**:

```
┌──────────────────────────────────────────────────────────────┐
│                    User Request                              │
│         "How do I use the new Bun.serve() API?"             │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│              PreToolUse:WebFetch Hook                        │
│                                                              │
│  1. Detect: Is this a library/framework question?            │
│  2. If yes → Route to Context7 MCP first                     │
│  3. If Context7 has answer → Use it, skip WebFetch           │
│  4. If Context7 doesn't have it → Fall through to WebFetch   │
└────────────────────────┬─────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
┌─────────────────────┐   ┌────────────────────┐
│     Context7        │   │     WebFetch       │
│  (accurate docs)    │   │  (fallback)        │
└─────────────────────┘   └────────────────────┘
```

**Auto-Install in `matrix init`**:

```bash
# During matrix init
matrix init
  # ...existing setup...

  # NEW: Context7 setup
  ? Install Context7 for library documentation? [Y/n]

  # If yes:
  claude mcp add context7 -- npx -y @anthropic-ai/context7-mcp

  # Add to hooks config
  # ~/.claude/settings.json
  {
    "hooks": {
      "PreToolUse": [{
        "matcher": "WebFetch|WebSearch",
        "command": "bun run ~/.claude/matrix/src/hooks/context7-intercept.ts"
      }]
    }
  }
```

**Hook Implementation**:

```typescript
// src/hooks/context7-intercept.ts

interface HookInput {
  tool: 'WebFetch' | 'WebSearch';
  input: {
    url?: string;
    query?: string;
  };
}

async function intercept(input: HookInput): Promise<HookResult> {
  // Patterns that suggest library/framework docs lookup
  const docPatterns = [
    /docs?\./,
    /documentation/,
    /api reference/i,
    /how to use .* (library|package|framework)/i,
    /(bun|deno|node|react|vue|next|express|fastify)/i,
  ];

  const queryOrUrl = input.input.query || input.input.url || '';

  const isDocLookup = docPatterns.some(p => p.test(queryOrUrl));

  if (isDocLookup) {
    // Extract library name
    const library = extractLibraryName(queryOrUrl);

    if (library) {
      // Call Context7 MCP
      const context7Result = await callContext7(library, queryOrUrl);

      if (context7Result.found) {
        return {
          decision: 'block',
          reason: `Found in Context7: ${library} documentation`,
          replacement: {
            tool: 'mcp_context7_get_docs',
            input: { library, query: queryOrUrl }
          }
        };
      }
    }
  }

  // Fall through to original tool
  return { decision: 'allow' };
}
```

**CLI for Context7 Management**:

```bash
matrix context7 status          # Check if installed
matrix context7 install         # Manual install
matrix context7 test <library>  # Test lookup
matrix context7 cache clear     # Clear doc cache
```

---

## Pillar 4: Prompt Agent

### 4.1 Core Concept

A meta-agent that intercepts user prompts, analyzes them for ambiguity, and optimizes them before execution. This runs as a hook on `UserPromptSubmit`.

### 4.2 Integration with Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    User sends prompt                            │
│              "fix the auth"                                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 UserPromptSubmit Hook                           │
│                                                                 │
│  1. Complexity Estimation (existing)                            │
│  2. Memory Injection (existing)                                 │
│  3. ──► Prompt Agent Analysis (NEW) ◄──                        │
│                                                                 │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Prompt Agent                                 │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. Load Context                                          │   │
│  │    - CLAUDE.md (project + global)                        │   │
│  │    - Git context (diff, recent commits)                  │   │
│  │    - Matrix memory (relevant solutions)                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 2. Analyze for Ambiguity                                 │   │
│  │    - Scope ambiguity? ("refactor this" → what?)          │   │
│  │    - Target ambiguity? ("fix the bug" → which one?)      │   │
│  │    - Approach ambiguity? ("make it better" → how?)       │   │
│  │    - Already answered in context?                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 3. Confidence Score                                      │   │
│  │    90-100%: Execute directly                             │   │
│  │    80-90%:  Quick confirmation                           │   │
│  │    60-80%:  One round of clarification                   │   │
│  │    40-60%:  Two rounds of clarification                  │   │
│  │    <40%:    Ask user to rephrase                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 4. Output                                                │   │
│  │    - Optimized prompt (structured)                       │   │
│  │    - OR clarification questions (max 2 rounds)           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Prompt Agent as MCP Tool

```typescript
// NEW: matrix_prompt tool
const promptAgentSchema = {
  name: 'matrix_prompt',
  description: 'Analyze and optimize a prompt before execution',
  inputSchema: {
    type: 'object',
    properties: {
      rawPrompt: { type: 'string', description: 'The original user prompt' },
      mode: {
        type: 'string',
        enum: ['interactive', 'auto', 'spawn'],
        default: 'interactive'
      },
      skipClarification: { type: 'boolean', default: false },
    },
    required: ['rawPrompt'],
  },
};

interface PromptAgentResult {
  optimizedPrompt: string;
  confidence: number;
  assumptions: string[];
  requiresApproval: boolean;
  clarificationNeeded?: {
    question: string;
    options: string[];
  };
  contextInjected: {
    fromClaudeMd: string[];
    fromGit: string[];
    fromMemory: string[];
  };
}
```

### 4.4 Shortcut Recognition

The Prompt Agent recognizes user shortcuts to avoid unnecessary friction:

| Shortcut | Action |
|----------|--------|
| `ship it` / `just do it` / `yolo` | Execute with best interpretation |
| `nah` / `nope` / `abort` | Stop, user will rephrase |
| `expand` / `more options` | Show more granular options |
| `hierarchize` / `break it down` | Create subtask plan |
| `assume [X]` | Lock in assumption X |
| `skip` | Skip current question, use judgment |

### 4.5 Configuration

```bash
# Enable/disable prompt agent
matrix config set prompt.enabled true

# Set confidence threshold for auto-execute
matrix config set prompt.autoExecuteThreshold 90

# Set max clarification rounds
matrix config set prompt.maxClarificationRounds 2

# Language preference
matrix config set prompt.language auto  # or 'en', 'pt'
```

### 4.6 Integration with Subshell Agents

When spawning an agent, the Prompt Agent can pre-optimize the task:

```bash
matrix spawn feature/auth --prompt "fix the auth"
# Prompt Agent intercepts:
#   - Detects ambiguity: "which auth issue?"
#   - Checks Matrix memory: found 3 related auth issues
#   - Asks clarification OR auto-selects most likely
#   - Passes optimized prompt to spawned agent
```

---

## Implementation Phases

### v1.0.0 — RELEASED
- [x] Core MCP tools (recall, store, reward, failure, status)
- [x] Local embeddings with transformers.js
- [x] Repository fingerprinting + context-aware scoring
- [x] Warning system (files/packages)
- [x] Claude Code hooks (7 total)
- [x] Prompt Agent as MCP tool (`matrix_prompt`)
- [x] Prompt Agent hook integration (runs before complexity)
- [x] Context7 intercept hooks (WebFetch/WebSearch)
- [x] Complexity estimation + package auditing

### v2.0.0 — Worktrees & Agents
- [ ] Basic worktree management (`matrix spawn`, `matrix kill`)
- [ ] Agent listing and status (`matrix agents`)
- [ ] Memory modes (shared/isolated/readonly)
- [ ] Agent attach/logs/prompt commands
- [ ] Memory merge on agent completion
- [ ] Orchestration patterns (sequential/parallel/fan-in)

### v2.1.0 — Enhanced Memory
- [ ] Enhanced `matrix_store()` with structured metadata
- [ ] Repo indexing infrastructure
- [ ] Solution linking and supersedes

### Future
- [ ] Resource limits and auto-suspend
- [ ] Agent health monitoring
- [ ] Windows WSL support

---

## Breaking Changes from v0.5.x

| Area | Change | Migration |
|------|--------|-----------|
| `matrix_store` | New schema with required fields | Existing solutions remain valid, new fields optional |
| Config | New sections for prompt/agents | Auto-migrated on first run |
| Database | New tables for agents, indexes | Auto-migrated via `matrix migrate` |
| Hooks | New hook types | Existing hooks unchanged |

---

## Success Metrics for v1.0.0

| Metric | Target |
|--------|--------|
| First-run to productive | < 2 minutes |
| Memory recall latency | < 100ms (with index) |
| Agent spawn time | < 5 seconds |
| Context7 hit rate | > 70% for doc queries |
| Prompt Agent clarification rate | < 30% of prompts |

---

## Completed (v1.0.0)

- [x] Core MCP tools (recall, store, reward, failure, status)
- [x] Local embeddings with transformers.js
- [x] Repository fingerprinting + context-aware scoring
- [x] Plugin-only distribution (Claude Code)
- [x] Comprehensive test suite
- [x] Claude Code hooks integration (7 hooks)
- [x] Warning system (files/packages)
- [x] Complexity estimation
- [x] Package auditing (CVEs, deprecation)
- [x] Prompt Agent MCP tool (`matrix_prompt`)
- [x] Prompt Agent hook integration (runs before complexity assessment)
- [x] Context7 WebFetch/WebSearch intercept hooks

---

## Contributing

Ideas? Issues? Open a discussion on [GitHub](https://github.com/ojowwalker77/Claude-Matrix/issues).

Priority contributions welcome:
- Context7 integration testing
- Windows WSL worktree support
- Agent orchestration patterns
- Prompt Agent pattern library
