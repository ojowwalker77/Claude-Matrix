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
import {
  formatCodeIndexContext,
  formatMatrixContext,
  assembleContext,
  getVerbosity,
  type IndexResult,
  type SolutionData,
  type FailureData,
} from './format-helpers.js';

const MAX_CONTEXT_WORDS = 500;

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
 * Query code index and format results for context injection (v2.0 verbosity-aware)
 */
function queryCodeIndex(query: { type: 'definition' | 'search'; symbol: string }): string | null {
  try {
    // Check if index is available
    const status = matrixIndexStatus();
    if (!status.indexed) {
      return null;
    }

    const verbosity = getVerbosity();

    if (query.type === 'definition') {
      const result = matrixFindDefinition({ symbol: query.symbol });
      if (!result.found || !result.definitions?.length) {
        return null;
      }

      const indexResults: IndexResult[] = result.definitions.slice(0, 5).map(def => ({
        symbol: query.symbol,
        file: def.file,
        line: def.line,
        kind: def.kind,
        signature: def.signature,
        exported: def.exported,
      }));

      return formatCodeIndexContext(query.symbol, indexResults, verbosity);
    }

    if (query.type === 'search') {
      const result = matrixSearchSymbols({ query: query.symbol, limit: 10 });
      if (!result.found || !result.results?.length) {
        return null;
      }

      const indexResults: IndexResult[] = result.results.slice(0, 10).map(sym => ({
        symbol: sym.name || query.symbol, // Use actual symbol name if available
        file: sym.file,
        line: sym.line,
        kind: sym.kind,
        signature: sym.signature,
        exported: sym.exported,
      }));

      return formatCodeIndexContext(query.symbol, indexResults, verbosity);
    }

    return null;
  } catch {
    // Silently fail - index might not be available
    return null;
  }
}

/**
 * Format solutions for context injection (v2.0 verbosity-aware wrapper)
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
  const verbosity = getVerbosity();

  // Use the verbosity-aware formatter
  const result = formatMatrixContext(
    solutions as SolutionData[],
    failures as FailureData[],
    complexity,
    verbosity
  );

  if (!result) {
    return '';
  }

  // Apply max words limit (only in full mode, compact is already short)
  if (verbosity === 'full') {
    const words = result.split(/\s+/);
    if (words.length > MAX_CONTEXT_WORDS) {
      return words.slice(0, MAX_CONTEXT_WORDS).join(' ') + '\n[Truncated...]';
    }
  }

  return result;
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
      // Still inject prompt agent context and code index if available (v2.0 verbosity-aware)
      const verbosity = getVerbosity();
      const lowComplexityParts: (string | null)[] = [];

      if (promptAnalysis.contextInjected.length > 0) {
        if (verbosity === 'full') {
          lowComplexityParts.push(`[Prompt Context]\n${promptAnalysis.contextInjected.join('\n')}`);
        } else {
          lowComplexityParts.push(promptAnalysis.contextInjected.join('\n'));
        }
      }
      lowComplexityParts.push(codeIndexContext);

      const assembled = assembleContext(lowComplexityParts, verbosity);
      if (assembled) {
        outputText(assembled);
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
    // STEP 5: Output combined context (v2.0 verbosity-aware)
    // ============================================
    const verbosity = getVerbosity();

    // Collect all context parts (some may be null)
    const contextParts: (string | null)[] = [];

    // Add prompt agent context first (already verbosity-formatted)
    if (promptAnalysis.contextInjected.length > 0) {
      // In compact mode, context is already formatted; in full mode, wrap it
      if (verbosity === 'full') {
        contextParts.push(`[Prompt Context]\n${promptAnalysis.contextInjected.join('\n')}`);
      } else {
        contextParts.push(promptAnalysis.contextInjected.join('\n'));
      }
    }

    // Add code index context (already verbosity-formatted)
    contextParts.push(codeIndexContext);

    // Add Matrix memory context (already verbosity-formatted)
    contextParts.push(context || null);

    // Assemble and output using verbosity-aware separator
    const assembled = assembleContext(contextParts, verbosity);
    if (assembled) {
      outputText(assembled);
    }

    process.exit(0);
  } catch (err) {
    // Log error but don't block
    console.error(`[Matrix] Prompt hook error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

if (import.meta.main) run();
