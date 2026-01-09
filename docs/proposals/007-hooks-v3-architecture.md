# MATRIX-007: Hooks v3 Architecture

**Status:** Draft
**Created:** 2025-01-09
**Author:** Matrix Contributors
**Priority:** P0 (Foundation)
**Depends On:** MATRIX-001 (User Rules), MATRIX-002 (Greptile-Proof Review)

## Executive Summary

This proposal defines the "smartest hooks architecture" for Claude-Matrix v2.0, transforming hooks from reactive utilities into a proactive intelligence layer that learns from every interaction, prevents errors before they happen, and creates a continuous feedback loop.

### Key Innovations

| Innovation | Current State | v3 State | Impact |
|------------|---------------|----------|--------|
| Error Memory | None | Auto-inject fixes on similar errors | -60% repeated errors |
| Blast Radius | None | Warn before editing high-impact files | -40% cascading bugs |
| Proactive Prevention | None | "You hit this error before" warnings | Better UX |
| Learning Loop | Manual | Auto-detect storable solutions | 3x more solutions stored |
| Security Scanning | None | Fast regex-based secret detection | Prevent leaks |
| User Rules | None | TypeScript-native configuration | Custom workflows |
| Session Context | None | Shared state between hooks | Smarter decisions |

---

## 1. Problem Statement

### 1.1 Current Limitations

Matrix's current hooks are **reactive** - they respond to events but don't learn from patterns:

```
Current Flow:
User makes mistake → Error happens → User debugs → User fixes → Same mistake possible tomorrow
```

**Issues:**
1. **No Error Memory**: Same errors are debugged repeatedly across sessions
2. **No Impact Analysis**: Editing a core file affects 50 dependents but no warning
3. **Manual Learning**: Users must remember to call `matrix_store`
4. **No Prevention**: Known failure patterns aren't surfaced proactively
5. **No Security**: Secrets can be written to files without warning
6. **No Custom Rules**: Users can't define project-specific behaviors

### 1.2 Ideal State

```
v3 Flow:
User starts task → Matrix recalls "you've hit X error before" → User avoids mistake
↓
User edits file → Matrix warns "15 files import this" → User runs tests first
↓
Complex task completed → Matrix detects novel solution → Auto-suggests storage
↓
Next session → Matrix recalls solution → Faster completion
```

---

## 2. Architecture Overview

### 2.1 Hook Pipeline Model

Every hook flows through a standardized pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│                        HOOK PIPELINE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐   ┌────────────┐   ┌──────────┐   ┌─────────────┐ │
│  │  Input  │ → │ Validators │ → │ Enrichers│ → │   Actions   │ │
│  └─────────┘   └────────────┘   └──────────┘   └─────────────┘ │
│       │              │               │               │         │
│       │              │               │               │         │
│       ▼              ▼               ▼               ▼         │
│   Parse JSON    Check rules      Add context     Execute       │
│   from stdin    User rules       Memory recall   side effects  │
│                 Security         Code index      Telemetry     │
│                 Block lists      Warnings        Logging       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Session Context Architecture

Hooks share state via a session context file, enabling intelligent cross-hook decisions:

```typescript
// ~/.claude/matrix/sessions/{session_id}.json
interface SessionContext {
  id: string;
  startedAt: string;

  // Tracking
  filesModified: string[];
  commandsRun: { command: string; exitCode: number; timestamp: string }[];
  errorsEncountered: { message: string; fixApplied?: string }[];
  memoryRecalls: { solutionId: string; similarity: number }[];

  // Analysis
  complexity: number;
  dominantTags: string[];
  intent: string;  // Extracted from first prompt

  // State
  testsRun: boolean;
  buildRun: boolean;
  lastActivity: string;
}
```

**Benefits:**
- Stop hook knows if tests were run (no transcript parsing needed)
- PostToolUse:Edit can track cumulative blast radius
- PreCompact can preserve session intent without re-analyzing

### 2.3 Event Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           MATRIX HOOKS v3 EVENT FLOW                         │
└──────────────────────────────────────────────────────────────────────────────┘

SessionStart ───────────────────────────────────────────────────────────────────
     │
     ├─→ Initialize DB (current)
     ├─→ Run indexer (current)
     ├─→ Load user rules (NEW)
     ├─→ Initialize session context (NEW)
     └─→ Print welcome stats (NEW)

UserPromptSubmit ───────────────────────────────────────────────────────────────
     │
     ├─→ Shortcut detection (current)
     ├─→ Complexity estimation (current)
     ├─→ Memory injection (current)
     ├─→ Code navigation (current)
     ├─→ Proactive error warning (NEW) ─────────────────────────────────────────
     │       └─→ "You've hit this error before: {error}. Previous fix: {fix}"
     ├─→ User rule validation (NEW)
     └─→ Extract intent → session context (NEW)

PreToolUse:Read ────────────────────────────────────────────────────────────────
     │
     └─→ Fast path (no processing)

PreToolUse:Bash ────────────────────────────────────────────────────────────────
     │
     ├─→ Package audit (current)
     ├─→ User rule validation (NEW) ────────────────────────────────────────────
     │       └─→ Block/warn based on command patterns
     ├─→ Dangerous command detection (NEW)
     │       └─→ rm -rf, dd if=, mkfs, etc.
     └─→ Safe command fast-path (NEW)
             └─→ ls, pwd, echo, date → no audit needed

PreToolUse:Edit/Write ──────────────────────────────────────────────────────────
     │
     ├─→ Blast radius analysis (NEW) ───────────────────────────────────────────
     │       └─→ Query code index for importers
     │       └─→ Warn if > threshold
     │       └─→ Suggest related test files
     ├─→ Security scanning (NEW) ───────────────────────────────────────────────
     │       └─→ Detect secrets (API keys, passwords)
     │       └─→ Detect vulnerable patterns
     ├─→ User rule validation (NEW)
     └─→ Track in session context (NEW)

PostToolUse:Bash ───────────────────────────────────────────────────────────────
     │
     ├─→ On success: Track command in session context (NEW)
     └─→ On error: ─────────────────────────────────────────────────────────────
             ├─→ Search failure DB for similar errors (NEW)
             ├─→ Inject previous fix if found (NEW)
             ├─→ Track error in session context (NEW)
             └─→ Auto-suggest matrix_failure if novel (NEW)

PostToolUse:Edit/Write ─────────────────────────────────────────────────────────
     │
     ├─→ Track file in session context (NEW)
     └─→ Cumulative blast radius warning (NEW)

PostToolUse:matrix_* ───────────────────────────────────────────────────────────
     │
     └─→ Contextual hints (current, enhanced)

PreCompact ─────────────────────────────────────────────────────────────────────
     │
     ├─→ Session analysis (current)
     ├─→ Log to file (current)
     └─→ Generate intent summary → inject to compacted context (NEW)

Stop ───────────────────────────────────────────────────────────────────────────
     │
     ├─→ Session analysis (current)
     ├─→ Suggest store (current)
     ├─→ Quality gate checks (NEW) ─────────────────────────────────────────────
     │       └─→ Tests run? (configurable)
     │       └─→ Build passed? (configurable)
     │       └─→ Lint clean? (configurable)
     ├─→ Novel solution detection (NEW) ────────────────────────────────────────
     │       └─→ Complexity > threshold
     │       └─→ No similar solution exists
     │       └─→ Auto-prompt for storage
     └─→ Generate session telemetry (NEW)
```

---

## 3. Detailed Feature Specifications

### 3.1 Error Memory Loop (PostToolUse:Bash Enhancement)

**The Problem**: Same errors are debugged repeatedly. Claude doesn't remember previous fixes.

**The Solution**: When a bash command fails, immediately search the failure database and inject the fix.

```typescript
// src/hooks/post-tool-bash.ts (enhanced)

async function handleBashError(
  command: string,
  exitCode: number,
  stderr: string,
  sessionContext: SessionContext
): Promise<string | null> {
  // Search for similar errors
  const similarErrors = await searchFailures(stderr, 3);

  if (similarErrors.length === 0) {
    // Novel error - track for potential storage
    sessionContext.errorsEncountered.push({
      message: stderr.slice(0, 500),
      timestamp: new Date().toISOString(),
    });

    return `[Matrix] Novel error detected. After fixing, consider matrix_failure to prevent recurrence.`;
  }

  // Found similar error - inject the fix
  const best = similarErrors[0];
  const fixPreview = best.fixApplied?.slice(0, 200) || 'No fix recorded';

  return `[Matrix] Similar error found (${Math.round(best.similarity * 100)}% match)

Previous error: ${best.errorMessage.slice(0, 100)}...
Root cause: ${best.rootCause || 'Unknown'}
Fix applied: ${fixPreview}

Try this approach to resolve the current error.`;
}
```

**Example Output:**
```
$ npm run build
Error: Module not found: '@/components/Button'

[Matrix] Similar error found (87% match)

Previous error: Module not found: '@/utils/helpers'
Root cause: Missing path alias in tsconfig
Fix applied: Add baseUrl and paths to tsconfig.json compilerOptions

Try this approach to resolve the current error.
```

**Impact**: -60% time spent debugging repeated errors

---

### 3.2 Blast Radius Analysis (PreToolUse:Edit Enhancement)

**The Problem**: Editing a core utility file can break dozens of consumers, but there's no warning.

**The Solution**: Query the code index for reverse dependencies and warn if editing high-impact files.

```typescript
// src/hooks/pre-tool-edit.ts (enhanced)

interface BlastRadiusResult {
  importedBy: number;
  files: string[];
  testFiles: string[];
  severity: 'low' | 'medium' | 'high';
}

async function analyzeBlastRadius(filePath: string): Promise<BlastRadiusResult> {
  // Query code index for who imports this file
  const callers = await matrixFindCallers({ file: filePath, limit: 50 });

  const testPatterns = [/\.test\./, /\.spec\./, /__tests__/, /test\//];
  const testFiles = callers.files.filter(f =>
    testPatterns.some(p => p.test(f))
  );

  const importedBy = callers.files.length;

  return {
    importedBy,
    files: callers.files.slice(0, 10),
    testFiles: testFiles.slice(0, 5),
    severity: importedBy > 20 ? 'high' : importedBy > 5 ? 'medium' : 'low',
  };
}

async function run() {
  const config = getConfig();
  const input = await readStdin<PreToolUseInput>();
  const filePath = input.tool_input.file_path as string;

  // Skip if blast radius analysis disabled
  if (!config.hooks.preToolEdit.blastRadius.enabled) {
    process.exit(0);
  }

  const result = await analyzeBlastRadius(filePath);

  if (result.severity === 'high') {
    const testSuggestion = result.testFiles.length > 0
      ? `\nRecommended tests: ${result.testFiles.slice(0, 3).join(', ')}`
      : '\nNo test files detected for this module.';

    outputJson({
      hookSpecificOutput: {
        permissionDecision: 'ask',
        permissionDecisionReason: `[Matrix] High-impact file detected!

This file is imported by ${result.importedBy} other files.
Top dependents: ${result.files.slice(0, 5).join(', ')}
${testSuggestion}

Proceed with edit? Consider running tests after changes.`,
      },
    });
  } else if (result.severity === 'medium' && config.hooks.preToolEdit.blastRadius.warnOnMedium) {
    console.error(`[Matrix] Note: ${result.importedBy} files import this module`);
  }

  process.exit(0);
}
```

**Example Output:**
```
Editing: src/utils/formatDate.ts

[Matrix] High-impact file detected!

This file is imported by 23 other files.
Top dependents: src/components/Calendar.tsx, src/pages/Dashboard.tsx, ...
Recommended tests: src/utils/__tests__/formatDate.test.ts

Proceed with edit? Consider running tests after changes.
```

**Dependency**: Requires `matrix_find_callers` tool from MATRIX-002

---

### 3.3 Proactive Error Prevention (UserPromptSubmit Enhancement)

**The Problem**: User is about to attempt something they've failed at before, but Claude doesn't warn them.

**The Solution**: Analyze the prompt against failure patterns and surface warnings proactively.

```typescript
// src/hooks/user-prompt-submit.ts (enhanced)

async function checkProactiveWarnings(prompt: string): Promise<string | null> {
  // Search for failure patterns that match this prompt
  const relatedFailures = await searchFailures(prompt, 3, { minSimilarity: 0.4 });

  if (relatedFailures.length === 0) return null;

  // Check if any failure is highly relevant
  const topMatch = relatedFailures[0];
  if (topMatch.similarity < 0.6) return null;

  // Format warning
  const fixPreview = topMatch.fixApplied?.slice(0, 150) || 'No fix recorded';

  return `[Matrix Caution] You've encountered a similar issue before:

Error: ${topMatch.errorMessage.slice(0, 100)}...
Root cause: ${topMatch.rootCause || 'Unknown'}
Previous fix: ${fixPreview}

Keep this in mind as you proceed.`;
}

export async function run() {
  const input = await readStdin<UserPromptSubmitInput>();

  // ... existing code ...

  // NEW: Check for proactive warnings
  const proactiveWarning = await checkProactiveWarnings(input.prompt);

  if (proactiveWarning) {
    contextParts.push(proactiveWarning);
  }

  // ... rest of function ...
}
```

**Example Output:**
```
User: "Set up CORS for the Express API"

[Matrix Caution] You've encountered a similar issue before:

Error: CORS preflight failing for POST requests
Root cause: Missing OPTIONS handling in middleware order
Previous fix: Move CORS middleware before route definitions

Keep this in mind as you proceed.
```

**Impact**: Prevents repeated mistakes before they happen

---

### 3.4 Security Scanning (PreToolUse:Edit/Write)

**The Problem**: Secrets can accidentally be written to files and committed.

**The Solution**: Fast regex-based detection of common secret patterns.

```typescript
// src/hooks/security-scanner.ts (new file)

const SECRET_PATTERNS = [
  // API Keys
  { pattern: /['"]?(?:api[_-]?key|apikey)['"]?\s*[:=]\s*['"]([a-zA-Z0-9]{20,})['"]/, name: 'API Key' },
  { pattern: /['"]sk-[a-zA-Z0-9]{32,}['"]/, name: 'OpenAI API Key' },
  { pattern: /['"]ghp_[a-zA-Z0-9]{36}['"]/, name: 'GitHub Token' },
  { pattern: /['"]AKIA[A-Z0-9]{16}['"]/, name: 'AWS Access Key' },

  // Passwords
  { pattern: /['"]?password['"]?\s*[:=]\s*['"](?!<|{|\$|process\.env)[^'"]{8,}['"]/, name: 'Hardcoded Password' },

  // Private Keys
  { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, name: 'Private Key' },

  // Database URLs with credentials
  { pattern: /(?:mongodb|postgres|mysql):\/\/[^:]+:[^@]+@/, name: 'Database URL with Credentials' },

  // JWT Secrets
  { pattern: /['"]?(?:jwt[_-]?secret|token[_-]?secret)['"]?\s*[:=]\s*['"][^'"]{16,}['"]/, name: 'JWT Secret' },
];

interface SecurityIssue {
  pattern: string;
  line: number;
  severity: 'warning' | 'critical';
}

function scanContent(content: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { pattern, name } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        issues.push({
          pattern: name,
          line: i + 1,
          severity: name.includes('Key') || name.includes('Private') ? 'critical' : 'warning',
        });
      }
    }
  }

  return issues;
}

export async function runSecurityScan(content: string): Promise<string | null> {
  const issues = scanContent(content);

  if (issues.length === 0) return null;

  const critical = issues.filter(i => i.severity === 'critical');
  const warnings = issues.filter(i => i.severity === 'warning');

  let message = '[Matrix Security] Potential secrets detected:\n\n';

  for (const issue of issues) {
    const icon = issue.severity === 'critical' ? '🚨' : '⚠️';
    message += `${icon} Line ${issue.line}: ${issue.pattern}\n`;
  }

  message += '\nConsider using environment variables instead.';

  return message;
}
```

**Example Output:**
```
Writing: src/config/api.ts

[Matrix Security] Potential secrets detected:

🚨 Line 5: OpenAI API Key
🚨 Line 12: AWS Access Key
⚠️ Line 18: Database URL with Credentials

Consider using environment variables instead.
```

**Impact**: Prevents accidental secret exposure

---

### 3.5 User Rules System Integration

**The Problem**: Users can't define project-specific hook behaviors.

**The Solution**: TypeScript-native configuration that hooks check at runtime.

```typescript
// matrix.config.ts (user's project)
import type { MatrixConfig } from '@matrix/types';

export default {
  hooks: {
    rules: [
      // Block dangerous bash patterns
      {
        id: 'no-rm-rf',
        event: 'PreToolUse:Bash',
        match: { command: /rm\s+-rf\s+\// },
        action: 'block',
        message: 'Dangerous command blocked: rm -rf with absolute path',
      },

      // Warn on console.log in TypeScript
      {
        id: 'no-console-log',
        event: 'PreToolUse:Edit',
        match: {
          filePath: /\.tsx?$/,
          content: /console\.log\(/,
        },
        action: 'warn',
        message: 'Consider using a proper logger instead of console.log',
      },

      // Require tests before stopping
      {
        id: 'require-tests',
        event: 'Stop',
        match: { testsRun: false },
        action: 'block',
        message: 'Please run tests before completing the task',
      },
    ],
  },
} satisfies MatrixConfig;
```

```typescript
// src/hooks/rule-engine.ts (new file)

interface Rule {
  id: string;
  event: string;
  match: Record<string, RegExp | boolean | string>;
  action: 'block' | 'warn' | 'allow';
  message: string;
}

function evaluateRule(rule: Rule, context: Record<string, unknown>): boolean {
  for (const [key, pattern] of Object.entries(rule.match)) {
    const value = context[key];

    if (pattern instanceof RegExp) {
      if (typeof value !== 'string' || !pattern.test(value)) {
        return false;
      }
    } else if (typeof pattern === 'boolean') {
      if (value !== pattern) {
        return false;
      }
    } else {
      if (value !== pattern) {
        return false;
      }
    }
  }

  return true;
}

export function checkRules(
  event: string,
  context: Record<string, unknown>,
  rules: Rule[]
): { action: 'block' | 'warn' | 'allow'; message?: string } {
  const eventRules = rules.filter(r => r.event === event);

  for (const rule of eventRules) {
    if (evaluateRule(rule, context)) {
      return { action: rule.action, message: rule.message };
    }
  }

  return { action: 'allow' };
}
```

**Dependency**: Full spec in MATRIX-001

---

### 3.6 Novel Solution Detection (Stop Enhancement)

**The Problem**: Users forget to store good solutions, losing valuable knowledge.

**The Solution**: Automatically detect when a novel, high-quality solution was created.

```typescript
// src/hooks/stop-session.ts (enhanced)

async function detectNovelSolution(
  sessionContext: SessionContext,
  transcript: TranscriptMessage[]
): Promise<{ isNovel: boolean; suggestedProblem: string } | null> {
  // Skip if complexity too low
  if (sessionContext.complexity < 6) {
    return null;
  }

  // Skip if errors were encountered without fixes
  const unfixedErrors = sessionContext.errorsEncountered.filter(e => !e.fixApplied);
  if (unfixedErrors.length > 0) {
    return null;
  }

  // Extract the problem from the first user message
  const firstPrompt = transcript.find(m => m.role === 'user')?.content || '';

  // Check if a similar solution already exists
  const existing = await matrixRecall({
    query: firstPrompt.slice(0, 300),
    limit: 1,
    minScore: 0.75,
  });

  if (existing.solutions.length > 0) {
    // Similar solution exists - not novel
    return null;
  }

  return {
    isNovel: true,
    suggestedProblem: firstPrompt.slice(0, 200),
  };
}

export async function run() {
  // ... existing code ...

  // Check for novel solution
  const novelCheck = await detectNovelSolution(sessionContext, transcript);

  if (novelCheck?.isNovel) {
    const output: HookOutput = {
      decision: 'block',
      reason: `[Matrix] Novel solution detected!

This session solved a complex problem (${sessionContext.complexity}/10) that doesn't match existing solutions.

Problem: "${novelCheck.suggestedProblem}..."
Tags: ${sessionContext.dominantTags.join(', ')}

Would you like to store this in Matrix memory?
• "yes" - Store for future recall
• "no" - Skip storage
• Custom description to refine the problem statement`,
    };

    outputJson(output);
    process.exit(0);
  }

  // ... rest of function ...
}
```

**Impact**: 3x more solutions stored through automatic detection

---

### 3.7 Quality Gate Checks (Stop Enhancement)

**The Problem**: Sessions end without verifying code quality (tests, build, lint).

**The Solution**: Configurable quality gates that can block session completion.

```typescript
// matrix.config.ts
export default {
  hooks: {
    stop: {
      qualityGates: {
        enabled: true,
        requireTests: true,      // Block if code changed but no tests run
        requireBuild: false,     // Optional: require build to pass
        requireLint: false,      // Optional: require lint to pass
      },
    },
  },
};
```

```typescript
// src/hooks/stop-session.ts (quality gates)

async function checkQualityGates(
  sessionContext: SessionContext,
  config: QualityGatesConfig
): Promise<{ passed: boolean; message?: string }> {
  if (!config.enabled) {
    return { passed: true };
  }

  const codeModified = sessionContext.filesModified.some(f =>
    /\.(ts|tsx|js|jsx|py|go|rs)$/.test(f)
  );

  if (!codeModified) {
    // No code changes - skip gates
    return { passed: true };
  }

  const failures: string[] = [];

  if (config.requireTests && !sessionContext.testsRun) {
    failures.push('Tests were not run after code changes');
  }

  if (config.requireBuild && !sessionContext.buildRun) {
    failures.push('Build was not run after code changes');
  }

  if (failures.length > 0) {
    return {
      passed: false,
      message: `[Matrix Quality Gate] Cannot complete session:

${failures.map(f => `• ${f}`).join('\n')}

Please address these before completing.`,
    };
  }

  return { passed: true };
}
```

**Impact**: Enforces team quality standards automatically

---

## 4. Performance Considerations

### 4.1 Hook Timing Budget

Each hook has a strict timing budget to ensure responsiveness:

| Hook | Budget | Current | v3 Target |
|------|--------|---------|-----------|
| SessionStart | 30s | ~15s | ~15s (no change) |
| UserPromptSubmit | 60s | ~200ms | ~300ms |
| PreToolUse:Bash | 30s | ~100ms (no audit) | ~150ms |
| PreToolUse:Edit | 10s | ~50ms | ~100ms |
| PostToolUse:Bash | 10s | ~50ms | ~100ms |
| Stop | 30s | ~200ms | ~300ms |

### 4.2 Optimization Strategies

1. **Parallel Execution**: All async operations run in parallel
2. **Early Exit**: Skip processing when not needed
3. **Caching**: Session context cached in memory
4. **Lazy Loading**: Heavy modules loaded only when needed
5. **Fast Path**: Common cases (ls, pwd, echo) bypass full analysis

```typescript
// Fast path for safe bash commands
const SAFE_COMMANDS = /^(ls|pwd|echo|date|whoami|cat|head|tail)\b/;

if (SAFE_COMMANDS.test(command)) {
  // Skip all analysis - instant approval
  process.exit(0);
}
```

---

## 5. Configuration Schema

### 5.1 Full Configuration

```typescript
// matrix.config.ts
interface HooksConfig {
  // Global toggle
  enabled: boolean;

  // UserPromptSubmit
  userPromptSubmit: {
    complexityThreshold: number;    // Default: 5
    enableProactiveWarnings: boolean;  // Default: true
    enableCodeNavDetection: boolean;   // Default: true
  };

  // PreToolUse:Bash
  preToolBash: {
    enablePackageAudit: boolean;    // Default: true
    enableDangerousCommandBlock: boolean;  // Default: true
    safeFastPath: boolean;          // Default: true
  };

  // PreToolUse:Edit
  preToolEdit: {
    blastRadius: {
      enabled: boolean;             // Default: true
      highThreshold: number;        // Default: 20
      mediumThreshold: number;      // Default: 5
      warnOnMedium: boolean;        // Default: false
    };
    securityScan: {
      enabled: boolean;             // Default: true
      patterns: 'default' | 'strict' | 'custom';
    };
  };

  // PostToolUse:Bash
  postToolBash: {
    enableErrorMemory: boolean;     // Default: true
    suggestFailureStorage: boolean; // Default: true
  };

  // Stop
  stop: {
    suggestStore: {
      enabled: boolean;             // Default: true
      minComplexity: number;        // Default: 6
      minMessages: number;          // Default: 3
      minToolUses: number;          // Default: 5
    };
    qualityGates: {
      enabled: boolean;             // Default: false
      requireTests: boolean;        // Default: false
      requireBuild: boolean;        // Default: false
    };
    novelSolutionDetection: boolean;  // Default: true
  };

  // User rules
  rules: Rule[];
}
```

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

| Task | Effort | Priority |
|------|--------|----------|
| Session context system | 3d | P0 |
| Rule engine | 2d | P0 |
| Configuration schema | 1d | P0 |
| Hook pipeline refactor | 2d | P0 |

### Phase 2: Core Features (Week 3-4)

| Task | Effort | Priority |
|------|--------|----------|
| Error memory loop | 2d | P0 |
| Proactive error prevention | 2d | P0 |
| Security scanning | 2d | P1 |
| Safe command fast path | 1d | P1 |

### Phase 3: Advanced Features (Week 5-6)

| Task | Effort | Priority |
|------|--------|----------|
| Blast radius analysis | 3d | P1 |
| Novel solution detection | 2d | P1 |
| Quality gate checks | 2d | P2 |
| User rules integration | 2d | P2 |

### Phase 4: Polish (Week 7-8)

| Task | Effort | Priority |
|------|--------|----------|
| Performance optimization | 3d | P1 |
| Documentation | 2d | P1 |
| Testing | 3d | P1 |
| Telemetry dashboard | 2d | P2 |

---

## 7. Success Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Repeated errors | Unknown | -60% | Track error message hashes |
| Solutions stored | ~10/week | ~30/week | Database count |
| Session completion time | Baseline | -20% | Telemetry |
| Security incidents | Unknown | 0 | Secret detection fires |
| Hook latency | ~100ms avg | <150ms avg | Performance telemetry |
| User rule adoption | 0% | >30% | Config file detection |

---

## 8. Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Hook latency increases | High | Medium | Strict timing budgets, async optimization |
| False positive security alerts | Medium | Medium | Configurable patterns, allowlist support |
| Session context file corruption | Medium | Low | Atomic writes, corruption recovery |
| Blast radius API missing | High | Low | Graceful degradation, index-optional mode |
| User rule complexity | Medium | Medium | Simple DSL, extensive examples |

---

## 9. Comparison to Alternatives

### vs. Hookify (Claude Code Plugin)

| Feature | Hookify | Matrix Hooks v3 |
|---------|---------|-----------------|
| Config format | Markdown + YAML | TypeScript native |
| Rule evaluation | Hand-rolled regex | TypeBox validated |
| Memory integration | None | Deep integration |
| Error learning | None | Error memory loop |
| Performance | File I/O per event | In-memory config |
| Type safety | None | Full TypeScript |

**Conclusion**: Matrix Hooks v3 is purpose-built for memory-enhanced workflows, while Hookify is a generic rule system. Matrix's approach is more powerful and performant for its specific use case.

### vs. Security-Guidance Plugin

| Feature | security-guidance | Matrix Security Scan |
|---------|-------------------|---------------------|
| Detection method | Python regex | TypeScript regex |
| Integration | Standalone | Part of hook pipeline |
| Configuration | Fixed patterns | Configurable |
| Performance | Python startup | In-process |

**Conclusion**: Matrix integrates security scanning into its existing pipeline for better performance and configuration.

---

## 10. Appendices

### A. Hook Input/Output Schemas

See `src/hooks/index.ts` for complete type definitions.

### B. Security Pattern Reference

See `src/hooks/security-scanner.ts` for full pattern list.

### C. Example Configurations

See `examples/matrix.config.ts` for real-world configurations.

---

## Summary

Matrix Hooks v3 transforms the hook system from reactive utilities into a proactive intelligence layer that:

1. **Learns from errors** - Injects previous fixes automatically
2. **Prevents mistakes** - Warns about known failure patterns
3. **Analyzes impact** - Warns before editing high-impact files
4. **Enforces security** - Blocks secrets before they're written
5. **Automates learning** - Detects novel solutions for storage
6. **Respects users** - Configurable rules for project-specific needs

This is the foundation for making Matrix not just a memory system, but a true AI-powered development companion.
