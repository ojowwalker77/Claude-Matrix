/**
 * User Rules Engine (v2.0)
 *
 * Evaluates user-configured rules against tool inputs.
 * Rules are defined in matrix.config under hooks.userRules.
 */

import { getConfig, type UserRule, type RuleEvent, type RuleAction } from '../config/index.js';

export interface RuleMatch {
  rule: UserRule;
  matched: boolean;
  action: RuleAction;
  message: string;
}

export interface RuleEvaluationResult {
  blocked: boolean;
  warned: boolean;
  matches: RuleMatch[];
  blockMessage?: string;
  warnings: string[];
}

// Cache compiled regex patterns (capped to prevent unbounded growth)
const MAX_CACHED_PATTERNS = 200;
const compiledPatterns = new Map<string, RegExp>();

/**
 * Get or compile a regex pattern with caching
 */
function getPattern(pattern: string): RegExp | null {
  if (compiledPatterns.has(pattern)) {
    return compiledPatterns.get(pattern)!;
  }

  try {
    const regex = new RegExp(pattern, 'i');

    // Evict all entries when cache exceeds limit (patterns are cheap to recompile)
    if (compiledPatterns.size >= MAX_CACHED_PATTERNS) {
      compiledPatterns.clear();
    }

    compiledPatterns.set(pattern, regex);
    return regex;
  } catch {
    // Invalid regex, return null
    return null;
  }
}

/**
 * Get rules for a specific event type
 */
export function getRulesForEvent(event: RuleEvent): UserRule[] {
  const config = getConfig();
  const rulesConfig = config.hooks.userRules;

  if (!rulesConfig.enabled) {
    return [];
  }

  return rulesConfig.rules
    .filter(rule => rule.enabled && rule.event === event)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * Evaluate rules against content
 */
export function evaluateRules(
  event: RuleEvent,
  content: string
): RuleEvaluationResult {
  const rules = getRulesForEvent(event);
  const matches: RuleMatch[] = [];
  const warnings: string[] = [];
  let blocked = false;
  let blockMessage: string | undefined;

  for (const rule of rules) {
    const pattern = getPattern(rule.pattern);
    if (!pattern) continue;

    const matched = pattern.test(content);

    if (matched) {
      matches.push({
        rule,
        matched: true,
        action: rule.action,
        message: rule.message,
      });

      if (rule.action === 'block') {
        blocked = true;
        blockMessage = rule.message;
        // Don't break - collect all matches for logging
      } else if (rule.action === 'warn') {
        warnings.push(rule.message);
      }
      // 'allow' action explicitly allows - no action needed
    }
  }

  return {
    blocked,
    warned: warnings.length > 0,
    matches,
    blockMessage,
    warnings,
  };
}

/**
 * Evaluate rules for Bash commands
 */
export function evaluateBashRules(command: string): RuleEvaluationResult {
  return evaluateRules('bash', command);
}

/**
 * Evaluate rules for Edit/Write operations
 */
export function evaluateEditRules(
  filePath: string,
  content?: string
): RuleEvaluationResult {
  // Combine file path and content for matching
  const combined = content ? `${filePath}\n${content}` : filePath;
  return evaluateRules('edit', combined);
}

/**
 * Evaluate rules for Read operations
 */
export function evaluateReadRules(filePath: string): RuleEvaluationResult {
  return evaluateRules('read', filePath);
}

/**
 * Evaluate rules for user prompts
 */
export function evaluatePromptRules(prompt: string): RuleEvaluationResult {
  return evaluateRules('prompt', prompt);
}

/**
 * Clear the pattern cache (useful for testing)
 */
export function clearPatternCache(): void {
  compiledPatterns.clear();
}

/**
 * Format rule evaluation result for hook output
 */
export function formatRuleResult(result: RuleEvaluationResult): string {
  const lines: string[] = [];

  if (result.blocked) {
    lines.push(`[Matrix Rule] BLOCKED: ${result.blockMessage}`);
  }

  for (const warning of result.warnings) {
    lines.push(`[Matrix Rule] Warning: ${warning}`);
  }

  return lines.join('\n');
}
