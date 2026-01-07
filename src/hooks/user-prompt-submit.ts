#!/usr/bin/env bun
/**
 * UserPromptSubmit Hook
 *
 * Runs when user submits a prompt (before Claude processes it).
 * Flow:
 *   1. Run Prompt Agent analysis (shortcuts, ambiguity, context)
 *   2. Estimate complexity
 *   3. Inject Matrix memories if complexity >= threshold
 *
 * Exit codes:
 *   0 = Success (stdout added to context)
 *   1 = Non-blocking error (stderr shown to user)
 *   2 = Blocking error (stderr fed back to Claude)
 */

import {
  readStdin,
  outputText,
  outputJson,
  hooksEnabled,
  getHooksConfig,
  type UserPromptSubmitInput,
} from './index.js';
import { estimateComplexity } from './complexity.js';
import { matrixRecall } from '../tools/recall.js';
import { searchFailures } from '../tools/failure.js';
import { analyzePromptSilent } from './prompt-utils.js';
import {
  matrixFindDefinition,
  matrixSearchSymbols,
  matrixIndexStatus,
} from '../tools/index-tools.js';

const MAX_CONTEXT_WORDS = 500;
const MAX_SOLUTION_CHARS = 300;

// Patterns for detecting code navigation queries
const DEFINITION_PATTERNS = [
  /where\s+is\s+(\w+)\s+defined/i,
  /find\s+(?:the\s+)?definition\s+(?:of\s+)?(\w+)/i,
  /show\s+me\s+(?:the\s+)?(\w+)\s+(?:function|class|type|interface)/i,
  /what\s+file\s+(?:has|contains)\s+(\w+)/i,
  /where\s+(?:is|are)\s+(\w+)\s+(?:located|declared)/i,
  /go\s+to\s+(\w+)/i,
  /find\s+(\w+)\s+(?:function|class|method|type)/i,
];

const SEARCH_PATTERNS = [
  /search\s+(?:for\s+)?(?:symbol\s+)?(\w+)/i,
  /find\s+(?:all\s+)?(?:symbols?\s+)?(?:like\s+|matching\s+)?(\w+)/i,
  /list\s+(?:all\s+)?(\w+)\s+functions/i,
];

/**
 * Detect if prompt is asking about code navigation
 * Returns symbol name if detected, null otherwise
 */
function detectCodeNavQuery(prompt: string): { type: 'definition' | 'search'; symbol: string } | null {
  // Check definition patterns
  for (const pattern of DEFINITION_PATTERNS) {
    const match = prompt.match(pattern);
    if (match?.[1]) {
      return { type: 'definition', symbol: match[1] };
    }
  }

  // Check search patterns
  for (const pattern of SEARCH_PATTERNS) {
    const match = prompt.match(pattern);
    if (match?.[1]) {
      return { type: 'search', symbol: match[1] };
    }
  }

  return null;
}

/**
 * Query code index and format results for context injection
 */
function queryCodeIndex(query: { type: 'definition' | 'search'; symbol: string }): string | null {
  try {
    // Check if index is available
    const status = matrixIndexStatus();
    if (!status.indexed) {
      return null;
    }

    if (query.type === 'definition') {
      const result = matrixFindDefinition({ symbol: query.symbol });
      if (!result.found || !result.definitions?.length) {
        return null;
      }

      const lines = [`[Code Index: "${query.symbol}" definitions]`];
      for (const def of result.definitions.slice(0, 5)) {
        const sig = def.signature ? ` - ${def.signature}` : '';
        const exp = def.exported ? ' (exported)' : '';
        lines.push(`• ${def.file}:${def.line} [${def.kind}]${sig}${exp}`);
      }
      lines.push('[End Code Index]');
      return lines.join('\n');
    }

    if (query.type === 'search') {
      const result = matrixSearchSymbols({ query: query.symbol, limit: 10 });
      if (!result.found || !result.results?.length) {
        return null;
      }

      const lines = [`[Code Index: symbols matching "${query.symbol}"]`];
      for (const sym of result.results.slice(0, 10)) {
        const sig = sym.signature ? ` - ${sym.signature}` : '';
        lines.push(`• ${sym.file}:${sym.line} [${sym.kind}]${sig}`);
      }
      lines.push('[End Code Index]');
      return lines.join('\n');
    }

    return null;
  } catch {
    // Silently fail - index might not be available
    return null;
  }
}

/**
 * Format solutions for context injection
 */
function formatContext(
  solutions: Array<{
    id: string;
    problem: string;
    solution: string;
    similarity: number;
    successRate: number;
    contextBoost?: string;
  }>,
  failures: Array<{
    id: string;
    errorMessage: string;
    rootCause: string | null;
    fixApplied: string | null;
    similarity: number;
  }>,
  complexity: { score: number; reasoning: string }
): string {
  if (solutions.length === 0 && failures.length === 0) {
    return '';
  }

  const lines: string[] = [
    `[Matrix Memory Context - Complexity: ${complexity.score}/10]`,
  ];

  if (complexity.reasoning) {
    lines.push(`Reason: ${complexity.reasoning}`);
  }

  if (solutions.length > 0) {
    lines.push('');
    lines.push('Relevant solutions:');

    for (const sol of solutions.slice(0, 3)) {
      const boost = sol.contextBoost ? ` (${sol.contextBoost})` : '';
      const successPct = Math.round(sol.successRate * 100);
      lines.push(`• [${sol.id}] ${successPct}% success${boost}`);

      // Truncate problem to first line or 100 chars
      const problemPreview = sol.problem.split('\n')[0]?.slice(0, 100) || sol.problem.slice(0, 100);
      lines.push(`  Problem: ${problemPreview}${problemPreview.length < sol.problem.length ? '...' : ''}`);

      // Truncate solution
      const solutionPreview = sol.solution.slice(0, MAX_SOLUTION_CHARS);
      lines.push(`  Solution: ${solutionPreview}${solutionPreview.length < sol.solution.length ? '...' : ''}`);
    }
  }

  if (failures.length > 0) {
    lines.push('');
    lines.push('Related errors to avoid:');

    for (const fail of failures.slice(0, 2)) {
      const errorPreview = fail.errorMessage.slice(0, 80);
      lines.push(`• [${fail.id}] ${errorPreview}${errorPreview.length < fail.errorMessage.length ? '...' : ''}`);
      if (fail.rootCause) {
        lines.push(`  Cause: ${fail.rootCause.slice(0, 100)}`);
      }
      if (fail.fixApplied) {
        lines.push(`  Fix: ${fail.fixApplied.slice(0, 100)}`);
      }
    }
  }

  lines.push('[End Matrix Context]');

  // Truncate to max words
  const fullText = lines.join('\n');
  const words = fullText.split(/\s+/);
  if (words.length > MAX_CONTEXT_WORDS) {
    return words.slice(0, MAX_CONTEXT_WORDS).join(' ') + '\n[Truncated...]';
  }

  return fullText;
}

export async function run() {
  try {
    // Check if hooks are enabled
    if (!hooksEnabled()) {
      process.exit(0);
    }

    // Read input from stdin
    const input = await readStdin<UserPromptSubmitInput>();

    // Get config
    const config = getHooksConfig();
    const threshold = config.complexityThreshold ?? 5;

    // ============================================
    // STEP 1: Run Prompt Agent analysis FIRST
    // ============================================
    const promptAnalysis = await analyzePromptSilent(input.prompt, input.cwd);

    // Handle abort shortcuts (nah, nope, abort, cancel)
    if (promptAnalysis.shortcut?.action === 'abort') {
      outputJson({
        hookSpecificOutput: {
          permissionDecision: 'deny',
          permissionDecisionReason: 'User aborted with shortcut: ' + promptAnalysis.shortcut.trigger,
        },
      });
      process.exit(0);
    }

    // Handle execute shortcuts (yolo, ship it, just do it)
    // Skip complexity check and memory injection, let Claude proceed fast
    if (promptAnalysis.shortcut?.action === 'execute') {
      process.exit(0);
    }

    // ============================================
    // STEP 2: Check for code navigation queries
    // ============================================
    let codeIndexContext: string | null = null;
    const codeNavQuery = detectCodeNavQuery(input.prompt);
    if (codeNavQuery) {
      codeIndexContext = queryCodeIndex(codeNavQuery);
    }

    // ============================================
    // STEP 3: Estimate complexity
    // ============================================
    const complexity = await estimateComplexity(input.prompt);

    // Skip memory injection if below threshold
    if (complexity.score < threshold) {
      // Still inject prompt agent context and code index if available
      const lowComplexityContext: string[] = [];
      if (promptAnalysis.contextInjected.length > 0) {
        lowComplexityContext.push(`[Prompt Context]\n${promptAnalysis.contextInjected.join('\n')}`);
      }
      if (codeIndexContext) {
        lowComplexityContext.push(codeIndexContext);
      }
      if (lowComplexityContext.length > 0) {
        outputText(lowComplexityContext.join('\n\n'));
      }
      process.exit(0);
    }

    // ============================================
    // STEP 4: Search Matrix memory
    // ============================================
    const recallResult = await matrixRecall({
      query: input.prompt.slice(0, 500), // Shorter query = less compute
      limit: 3,
      minScore: 0.55, // Higher threshold = fewer irrelevant injections
    });

    // Also search for related failures
    const failures = await searchFailures(input.prompt.slice(0, 500), 2);

    // Format context
    const context = formatContext(
      recallResult.solutions,
      failures,
      complexity
    );

    // ============================================
    // STEP 5: Output combined context
    // ============================================
    const contextParts: string[] = [];

    // Add prompt agent context first
    if (promptAnalysis.contextInjected.length > 0) {
      contextParts.push(`[Prompt Context]\n${promptAnalysis.contextInjected.join('\n')}`);
    }

    // Add code index context
    if (codeIndexContext) {
      contextParts.push(codeIndexContext);
    }

    // Add Matrix memory context
    if (context) {
      contextParts.push(context);
    }

    // Output all context to Claude
    if (contextParts.length > 0) {
      outputText(contextParts.join('\n\n'));
    }

    process.exit(0);
  } catch (err) {
    // Log error but don't block
    console.error(`[Matrix] Prompt hook error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

if (import.meta.main) run();
