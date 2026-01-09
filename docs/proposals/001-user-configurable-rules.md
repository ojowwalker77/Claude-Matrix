# Feature Proposal: User-Configurable Rules System

**Proposal ID:** MATRIX-001
**Author:** Claude Matrix Team
**Status:** Draft
**Created:** 2025-01-09
**Last Updated:** 2025-01-09

---

## Executive Summary

This proposal introduces a **user-configurable rules system** for Claude Matrix that allows users to define custom pattern-matching rules without modifying source code. We explicitly reject the "markdown-as-config" approach used by Claude Code's hookify plugin in favor of a **TypeScript-native, JSON-configurable** solution that maintains determinism, type safety, and performance.

**Key Decision:** Deterministic operations must remain deterministic. We will not introduce generative AI or fragile parsing layers into the critical path of tool execution.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Background: The Hookify Approach](#background-the-hookify-approach)
3. [Why Hookify Is Wrong for Matrix](#why-hookify-is-wrong-for-matrix)
4. [Proposed Solution](#proposed-solution)
5. [Technical Design](#technical-design)
6. [User Experience](#user-experience)
7. [Trade-offs & Alternatives Considered](#trade-offs--alternatives-considered)
8. [Implementation Plan](#implementation-plan)
9. [Success Metrics](#success-metrics)
10. [Appendix: Hookify Architecture Analysis](#appendix-hookify-architecture-analysis)

---

## Problem Statement

### Current State

Matrix v1.2 has a sophisticated hook system with hardcoded patterns:

```typescript
// src/hooks/pre-tool-read.ts (simplified)
const SENSITIVE_PATTERNS = [
  /\.env$/,
  /\.pem$/,
  /id_rsa/,
  /secrets\//,
];
```

**Pain Points:**

1. **No user customization** - Users cannot add patterns without forking Matrix
2. **No per-project rules** - A monorepo user can't have different rules per workspace
3. **No quick toggles** - Disabling a rule requires code changes
4. **Feature requests accumulate** - Every "add pattern X" request requires a code change

### User Stories

> **As a security-conscious developer**, I want to add my company's custom credential patterns (e.g., `acme_secret_*`) to the sensitive file detection, so that Matrix warns me before reading proprietary secrets.

> **As a team lead**, I want to enforce "no console.log in production code" for my team's projects, without waiting for Matrix to add this as a feature.

> **As a solo developer**, I want to disable the CVE checking for a legacy project that I know has unfixable vulnerabilities, without disabling it globally.

---

## Background: The Hookify Approach

Claude Code's official plugin ecosystem includes **hookify**, which allows user-defined rules via markdown files. Understanding this approach is critical before explaining why we reject it.

### How Hookify Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HOOKIFY ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User creates:  .claude/hookify.my-rule.local.md                   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ---                                                          │  │
│  │  name: block-rm-rf                                            │  │
│  │  enabled: true                                                │  │
│  │  event: bash                                                  │  │
│  │  pattern: rm\s+-rf                                            │  │
│  │  action: block                                                │  │
│  │  ---                                                          │  │
│  │                                                               │  │
│  │  ⚠️ Dangerous command detected!                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Python: config_loader.py                                     │  │
│  │  - Read file from disk (every hook invocation)               │  │
│  │  - Split on "---" markers                                     │  │
│  │  - Hand-parse YAML (90 lines of string manipulation)         │  │
│  │  - Build Rule dataclass                                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Python: rule_engine.py                                       │  │
│  │  - Compile regex (LRU cached)                                 │  │
│  │  - Match against tool input                                   │  │
│  │  - Return JSON decision                                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Claude Code: Parse JSON response                             │  │
│  │  - Apply permission decision                                  │  │
│  │  - Display system message                                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### The `/hookify` Command

Additionally, hookify provides a `/hookify` slash command that uses **Claude (the LLM)** to:
1. Analyze recent conversation for "frustration signals"
2. Generate rule files based on detected patterns
3. Write markdown files to the user's project

---

## Why Hookify Is Wrong for Matrix

### Principle: Deterministic Operations Must Be Deterministic

Pattern matching against tool inputs is a **deterministic operation**. Given the same input and the same rules, the output must always be identical. Introducing non-deterministic elements (LLM generation, fragile parsing) into this path violates a fundamental architectural principle.

### Problem 1: Hand-Rolled YAML Parser

Hookify does not use a proper YAML parser. Instead, it implements a custom parser in ~90 lines of Python:

```python
# From hookify/core/config_loader.py lines 106-194
def extract_frontmatter(content: str) -> tuple[Dict[str, Any], str]:
    # ... 90 lines of string splitting, indent counting,
    # state machines for "in_list", "in_dict_item", etc.

    for line in lines:
        stripped = line.strip()
        indent = len(line) - len(line.lstrip())

        if indent == 0 and ':' in line and not line.strip().startswith('-'):
            # Save previous list/dict if any
            if in_list and current_key:
                if in_dict_item and current_dict:
                    current_list.append(current_dict)
                    # ... more state management
```

**This is a bug farm.** Any YAML edge case not explicitly handled will cause silent failures or incorrect parsing. Examples:
- Multi-line strings with `|` or `>`
- Anchors and aliases (`&anchor`, `*alias`)
- Complex nested structures
- Unicode edge cases
- Quoted strings with escape sequences

### Problem 2: File I/O on Every Hook Invocation

```python
# From hookify/core/config_loader.py
def load_rules(event: Optional[str] = None) -> List[Rule]:
    pattern = os.path.join('.claude', 'hookify.*.local.md')
    files = glob.glob(pattern)  # Disk I/O

    for file_path in files:
        with open(file_path, 'r') as f:  # More disk I/O
            content = f.read()
```

Every PreToolUse, PostToolUse, Stop, and UserPromptSubmit hook:
1. Globs the filesystem
2. Reads all matching files
3. Parses all files
4. Builds all Rule objects

This happens **on every tool call**. In a busy session with 100+ tool calls, that's 100+ file system scans.

### Problem 3: Cross-Language Serialization Boundaries

```
TypeScript (Claude Code)
    → JSON stdin
    → Python (hookify)
    → JSON stdout
    → TypeScript (Claude Code)
```

Each boundary is a potential failure point:
- JSON serialization bugs
- Encoding mismatches
- Process spawn overhead
- Error message loss across boundaries

### Problem 4: LLM in the Config Generation Path

The `/hookify` command uses Claude to generate config files:

```typescript
// From hookify/commands/hookify.md
Use the Task tool to launch conversation-analyzer agent:
{
  "subagent_type": "general-purpose",
  "prompt": "You are analyzing a Claude Code conversation to find behaviors
             the user wants to prevent..."
}
```

This means:
- **Non-deterministic output** - Same conversation may produce different rules
- **Token cost** - Every `/hookify` invocation burns tokens
- **Latency** - Seconds of wait time for LLM response
- **Hallucination risk** - LLM may generate invalid regex patterns

### Problem 5: Debugging Nightmare

When a hookify rule doesn't work:
1. Is the markdown file in the right location?
2. Is the YAML frontmatter valid?
3. Did the custom parser handle your edge case?
4. Is the regex pattern correct?
5. Is the event type correct?
6. Did Python throw an exception that was silently caught?
7. Did the JSON response serialize correctly?

Compare to TypeScript:
1. Is the pattern correct? (TypeScript compiler will tell you if the regex is malformed)
2. Done.

### Problem 6: No Type Safety

```yaml
# Typo in field name - silently ignored
naem: my-rule  # Should be "name"
enbled: true   # Should be "enabled"
evnet: bash    # Should be "event"
```

In TypeScript:
```typescript
const rule: Rule = {
  naem: "my-rule",  // ❌ TypeScript Error: 'naem' does not exist on type 'Rule'
};
```

### The Numbers

| Metric | Hookify | TypeScript-native |
|--------|---------|-------------------|
| Languages involved | 3 (MD, Python, JSON) | 1 (TypeScript) |
| Parsing steps | 4+ | 1 (JSON.parse or import) |
| Lines of parsing code | ~200 | 0 (use standard libraries) |
| Type safety | None | Full |
| File I/O per hook | O(n) files | O(1) at startup |
| Can unit test rules | No | Yes |
| IDE support | None | Full autocomplete |

---

## Proposed Solution

### Design Principles

1. **Deterministic**: No LLM in the execution path
2. **Type-safe**: TypeScript types for all configuration
3. **Performant**: Parse once at startup, not on every hook
4. **Standard**: Use JSON (already parsed by Matrix config system)
5. **Testable**: Rules can be unit tested
6. **Debuggable**: Clear error messages with source locations

### Configuration Location

Extend existing `~/.claude/matrix/matrix.config`:

```json
{
  "indexing": { ... },
  "hooks": {
    "enabled": true,
    "rules": [
      {
        "name": "block-rm-rf",
        "enabled": true,
        "event": "bash",
        "pattern": "rm\\s+-rf",
        "action": "block",
        "message": "⚠️ Dangerous rm command detected!"
      },
      {
        "name": "warn-env-files",
        "enabled": true,
        "event": "file",
        "conditions": [
          { "field": "file_path", "operator": "regex", "pattern": "\\.env$" }
        ],
        "action": "warn",
        "message": "🔐 Editing sensitive file"
      }
    ]
  }
}
```

### Why JSON Over Markdown

| Aspect | Markdown + YAML | JSON |
|--------|-----------------|------|
| Parser | Custom, fragile | `JSON.parse()` - battle-tested |
| Validation | Runtime, silent failures | JSON Schema, compile-time with TypeScript |
| IDE support | None | Full autocomplete |
| Comments | Supported but complicate parsing | Use `_comment` fields or external docs |
| Multi-line messages | Natural | Use `\n` or array of strings |

The ONE advantage of markdown (multi-line message body) is easily solved:

```json
{
  "message": [
    "⚠️ **Dangerous rm command detected!**",
    "",
    "Please verify the path before using rm -rf.",
    "Consider using trash-cli instead."
  ]
}
```

Or simply:
```json
{
  "message": "⚠️ **Dangerous rm command detected!**\n\nPlease verify the path."
}
```

---

## Technical Design

### Type Definitions

```typescript
// src/types/rules.ts

export type RuleEvent = 'bash' | 'file' | 'read' | 'web' | 'stop' | 'prompt';
export type RuleAction = 'allow' | 'warn' | 'block';
export type ConditionOperator = 'regex' | 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'not';

export interface RuleCondition {
  field: string;           // 'command', 'file_path', 'content', 'url', etc.
  operator: ConditionOperator;
  pattern: string;
  negate?: boolean;        // Invert the match
}

export interface UserRule {
  name: string;
  enabled: boolean;
  event: RuleEvent | RuleEvent[];

  // Simple pattern (shorthand for single regex condition)
  pattern?: string;

  // Complex conditions (all must match)
  conditions?: RuleCondition[];

  action: RuleAction;
  message: string | string[];

  // Optional metadata
  description?: string;
  tags?: string[];
}

export interface CompiledRule extends Omit<UserRule, 'pattern' | 'conditions'> {
  matchers: Array<{
    field: string;
    test: (value: string) => boolean;
  }>;
  messageText: string;
}
```

### Rule Compiler

```typescript
// src/rules/compiler.ts

import { UserRule, CompiledRule, RuleCondition } from '../types/rules';

export function compileRule(rule: UserRule): CompiledRule {
  const matchers: CompiledRule['matchers'] = [];

  // Handle simple pattern shorthand
  if (rule.pattern) {
    const regex = new RegExp(rule.pattern, 'i');
    const field = inferFieldFromEvent(rule.event);
    matchers.push({
      field,
      test: (value: string) => regex.test(value),
    });
  }

  // Handle complex conditions
  if (rule.conditions) {
    for (const condition of rule.conditions) {
      matchers.push({
        field: condition.field,
        test: compileCondition(condition),
      });
    }
  }

  // Normalize message to string
  const messageText = Array.isArray(rule.message)
    ? rule.message.join('\n')
    : rule.message;

  return {
    name: rule.name,
    enabled: rule.enabled,
    event: rule.event,
    action: rule.action,
    message: rule.message,
    messageText,
    matchers,
    description: rule.description,
    tags: rule.tags,
  };
}

function compileCondition(condition: RuleCondition): (value: string) => boolean {
  const { operator, pattern, negate } = condition;

  let test: (value: string) => boolean;

  switch (operator) {
    case 'regex':
      const regex = new RegExp(pattern, 'i');
      test = (v) => regex.test(v);
      break;
    case 'contains':
      test = (v) => v.includes(pattern);
      break;
    case 'equals':
      test = (v) => v === pattern;
      break;
    case 'startsWith':
      test = (v) => v.startsWith(pattern);
      break;
    case 'endsWith':
      test = (v) => v.endsWith(pattern);
      break;
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }

  return negate ? (v) => !test(v) : test;
}

function inferFieldFromEvent(event: RuleEvent | RuleEvent[]): string {
  const primary = Array.isArray(event) ? event[0] : event;
  switch (primary) {
    case 'bash': return 'command';
    case 'file': return 'new_text';
    case 'read': return 'file_path';
    case 'web': return 'url';
    case 'prompt': return 'user_prompt';
    default: return 'content';
  }
}
```

### Rule Engine

```typescript
// src/rules/engine.ts

import { CompiledRule, RuleAction } from '../types/rules';

export interface RuleInput {
  event: string;
  [key: string]: unknown;
}

export interface RuleResult {
  matched: boolean;
  rule?: CompiledRule;
  action: RuleAction;
  message?: string;
}

export class RuleEngine {
  private rules: CompiledRule[] = [];

  constructor(rules: CompiledRule[]) {
    this.rules = rules.filter(r => r.enabled);
  }

  evaluate(input: RuleInput): RuleResult {
    for (const rule of this.rules) {
      // Check event type matches
      const events = Array.isArray(rule.event) ? rule.event : [rule.event];
      if (!events.includes(input.event as any)) {
        continue;
      }

      // Check all matchers pass
      const allMatch = rule.matchers.every(matcher => {
        const value = String(input[matcher.field] ?? '');
        return matcher.test(value);
      });

      if (allMatch) {
        return {
          matched: true,
          rule,
          action: rule.action,
          message: rule.messageText,
        };
      }
    }

    return { matched: false, action: 'allow' };
  }
}
```

### Integration with Existing Hooks

```typescript
// src/hooks/index.ts (modified)

import { getConfig } from '../config';
import { compileRule } from '../rules/compiler';
import { RuleEngine } from '../rules/engine';

let ruleEngine: RuleEngine | null = null;

export function initializeRules(): void {
  const config = getConfig();
  const userRules = config.hooks?.rules ?? [];

  const compiled = userRules.map(rule => {
    try {
      return compileRule(rule);
    } catch (err) {
      console.error(`Invalid rule "${rule.name}": ${err.message}`);
      return null;
    }
  }).filter(Boolean);

  ruleEngine = new RuleEngine(compiled);
  console.log(`Loaded ${compiled.length} user rules`);
}

export function evaluateUserRules(input: RuleInput): RuleResult {
  if (!ruleEngine) {
    initializeRules();
  }
  return ruleEngine!.evaluate(input);
}
```

### Usage in PreToolUse Hook

```typescript
// src/hooks/pre-tool-bash.ts (modified)

import { evaluateUserRules } from './index';

export async function preToolBash(input: BashInput): Promise<HookResult> {
  // Existing Matrix logic...

  // NEW: Evaluate user rules
  const ruleResult = evaluateUserRules({
    event: 'bash',
    command: input.command,
  });

  if (ruleResult.matched) {
    if (ruleResult.action === 'block') {
      return {
        decision: 'deny',
        systemMessage: ruleResult.message,
      };
    } else if (ruleResult.action === 'warn') {
      return {
        decision: 'allow',
        systemMessage: ruleResult.message,
      };
    }
  }

  // Continue with existing logic...
}
```

---

## User Experience

### Adding a New Rule

**Hookify approach (what we're avoiding):**
```bash
# Option 1: Use LLM to generate (non-deterministic)
/hookify "Don't use rm -rf"

# Option 2: Manually create markdown file
# Create .claude/hookify.rm-warning.local.md
# Write YAML frontmatter
# Hope the custom parser handles it
```

**Matrix approach:**
```bash
# Edit matrix.config (JSON, validated, autocomplete in IDE)
# Or use the new /matrix:rule command

/matrix:rule add
# Interactive prompts:
# > Rule name: block-rm-rf
# > Event type: bash
# > Pattern (regex): rm\s+-rf
# > Action: block
# > Message: ⚠️ Dangerous rm command!

# Result: Rule added to ~/.claude/matrix/matrix.config
```

### Listing Rules

```bash
/matrix:rules
# Output:
#
# User Rules (3 enabled, 1 disabled):
#
# ✅ block-rm-rf         [bash]   block   "rm\s+-rf"
# ✅ warn-env-files      [file]   warn    "\.env$"
# ✅ require-tests       [stop]   block   (no tests in transcript)
# ⏸️ debug-console-log   [file]   warn    "console\.log\("
```

### Disabling a Rule

```bash
/matrix:rule disable debug-console-log
# Rule "debug-console-log" disabled

# Or edit matrix.config: set "enabled": false
```

### Error Messages

```bash
# Invalid regex pattern
Error loading rule "my-rule": Invalid regex pattern "rm\s+-rf[" - Unterminated character class

# Unknown event type
Error loading rule "my-rule": Unknown event type "bsh". Valid types: bash, file, read, web, stop, prompt

# Missing required field
Error loading rule "my-rule": Missing required field "action"
```

Compare to hookify's error handling:
```python
except Exception as e:
    # Silently continue - rule just doesn't work
    print(f"Warning: Unexpected error loading {file_path}", file=sys.stderr)
    continue
```

---

## Trade-offs & Alternatives Considered

### Alternative 1: Copy Hookify Exactly

**Rejected.** See entire "Why Hookify Is Wrong" section.

### Alternative 2: Use TypeScript Files for Rules

```typescript
// ~/.claude/matrix/rules/block-rm.ts
export default {
  name: 'block-rm-rf',
  event: 'bash',
  match: (input) => /rm\s+-rf/.test(input.command),
  action: 'block',
  message: '⚠️ Dangerous!'
} satisfies UserRule;
```

**Pros:**
- Full TypeScript power (computed patterns, shared utilities)
- Perfect type safety

**Cons:**
- Requires TypeScript compilation
- Security concerns (executing arbitrary user code)
- Complexity

**Verdict:** Consider for v2. Start with JSON for simplicity and security.

### Alternative 3: YAML Configuration (with proper parser)

```yaml
# ~/.claude/matrix/rules.yaml
rules:
  - name: block-rm-rf
    event: bash
    pattern: 'rm\s+-rf'
    action: block
    message: |
      ⚠️ Dangerous rm command!
      Please verify the path.
```

**Pros:**
- Slightly more readable than JSON
- Multi-line strings are natural

**Cons:**
- Another dependency (js-yaml)
- YAML has many footguns (Norway problem, implicit typing)
- Less universal than JSON

**Verdict:** Possible, but JSON is safer and simpler.

### Alternative 4: Hybrid (JSON config + Markdown messages)

```json
{
  "rules": [
    {
      "name": "block-rm-rf",
      "event": "bash",
      "pattern": "rm\\s+-rf",
      "action": "block",
      "messageFile": "./messages/block-rm.md"
    }
  ]
}
```

**Pros:**
- Best of both worlds?

**Cons:**
- Now we have two file formats
- File I/O for messages
- Complexity

**Verdict:** Over-engineered. Just use `\n` in JSON strings.

---

## Implementation Plan

### Phase 1: Core Engine (1-2 days)

- [ ] Define TypeScript types for rules
- [ ] Implement rule compiler
- [ ] Implement rule engine
- [ ] Add to config schema with validation
- [ ] Unit tests for rule matching

### Phase 2: Hook Integration (1 day)

- [ ] Initialize rules at startup (not per-hook)
- [ ] Add rule evaluation to PreToolUse hooks
- [ ] Add rule evaluation to Stop hook
- [ ] Add rule evaluation to UserPromptSubmit hook

### Phase 3: User Commands (1 day)

- [ ] `/matrix:rules` - List all rules
- [ ] `/matrix:rule add` - Interactive rule creation
- [ ] `/matrix:rule enable/disable <name>` - Toggle rules
- [ ] `/matrix:rule remove <name>` - Delete rule

### Phase 4: Documentation & Examples

- [ ] Update README with rules documentation
- [ ] Add example rules to docs/examples/
- [ ] Add to CHANGELOG

### Non-Goals (Explicitly Deferred)

- LLM-assisted rule generation (violates determinism principle)
- Per-project rule files (can use project settings.json)
- Rule sharing/marketplace (future consideration)
- Complex rule logic (AND/OR/NOT trees) - keep it simple

---

## Success Metrics

### Quantitative

| Metric | Target |
|--------|--------|
| Rule evaluation latency | < 1ms for 100 rules |
| Config parsing errors surfaced | 100% (no silent failures) |
| Test coverage for rule engine | > 90% |

### Qualitative

- Users can add custom patterns without reading source code
- Error messages clearly indicate what's wrong and where
- IDE provides autocomplete for rule configuration
- Rules work identically across all environments

---

## Appendix: Hookify Architecture Analysis

### Source Files Analyzed

| File | Lines | Purpose |
|------|-------|---------|
| `config_loader.py` | 298 | YAML parsing, Rule dataclass |
| `rule_engine.py` | 314 | Pattern matching, result generation |
| `pretooluse.py` | 74 | Hook entry point |
| `posttooluse.py` | ~70 | Hook entry point |
| `stop.py` | ~60 | Hook entry point |
| `userpromptsubmit.py` | ~60 | Hook entry point |
| `hookify.md` | 232 | Slash command (uses LLM) |
| `SKILL.md` | 375 | Rule writing guide |
| **Total** | **~1500** | |

### Complexity Comparison

**Hookify:**
- 3 languages (Python, Markdown, JSON)
- 2 custom parsers (YAML frontmatter, condition lists)
- 4 hook entry points
- 1 LLM-powered command
- ~1500 lines of code

**Proposed Matrix solution:**
- 1 language (TypeScript)
- 0 custom parsers (use JSON.parse)
- Integration into existing hooks
- 0 LLM dependencies
- ~300 lines of code (estimated)

### Performance Comparison

**Hookify per-hook overhead:**
```
glob(".claude/hookify.*.local.md")  ~1-5ms (filesystem)
for each file:
  open() + read()                   ~0.5ms per file
  extract_frontmatter()             ~0.1ms per file
  Rule.from_dict()                  ~0.01ms per file
compile_regex() (cached)            ~0ms (after first)
evaluate()                          ~0.01ms per rule
JSON serialization                  ~0.1ms
```

**Total for 10 rules: ~10-20ms per hook invocation**

**Matrix proposed overhead:**
```
(at startup only)
JSON.parse(config)                  ~1ms
compileRule() for each              ~0.1ms per rule
(per hook)
evaluate()                          ~0.01ms per rule
```

**Total for 10 rules: ~0.1ms per hook invocation (100-200x faster)**

---

## Conclusion

The hookify approach optimizes for a different audience (non-developers, closed-source plugin ecosystem) with different constraints. Matrix users are developers who benefit from:

1. **Type safety** over "easy syntax"
2. **Determinism** over "magic generation"
3. **Performance** over "hot reload without restart"
4. **Debuggability** over "it just works (sometimes)"

We should provide user-configurable rules, but through a TypeScript-native, JSON-configured system that respects our architectural principles.

---

**Decision:** Implement JSON-based user rules as described in this proposal.

**Next Steps:**
1. Review with stakeholders
2. Create implementation tickets
3. Begin Phase 1 development
