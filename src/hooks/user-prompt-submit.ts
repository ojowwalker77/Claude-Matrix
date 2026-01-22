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
import { evaluatePromptRules, formatRuleResult } from './rule-engine.js';
import { getSession, createSession, updateSessionMode } from '../session/index.js';
import { isValidSessionMode, SESSION_MODES, type SessionMode } from '../types/session.js';
import {
  shouldInjectMemory,
  shouldRunComplexityAnalysis,
  shouldSuggestPlanMode,
  getComplexityThreshold,
  getMaxSolutions,
  getMaxFailures,
  formatModeContext,
} from './mode-behavior.js';

const MAX_CONTEXT_WORDS = 500;

/**
 * Mode selection patterns
 * Matches: "ultrathink", "1", "quick mode", "use debug", etc.
 */
const MODE_SELECTION_PATTERNS: Array<{ pattern: RegExp; mode: SessionMode }> = [
  { pattern: /^(?:use\s+)?(?:1|ultrathink|ultra\s*think)\s*(?:mode)?$/i, mode: 'ultrathink' },
  { pattern: /^(?:use\s+)?(?:2|quick)\s*(?:mode)?$/i, mode: 'quick' },
  { pattern: /^(?:use\s+)?(?:3|docs?|documentation)\s*(?:mode)?$/i, mode: 'docs' },
  { pattern: /^(?:use\s+)?(?:4|debug|investigate)\s*(?:mode)?$/i, mode: 'debug' },
  { pattern: /^(?:use\s+)?(?:5|classic|normal|default)\s*(?:mode)?$/i, mode: 'classic' },
];

/**
 * Detect if prompt is a session mode selection
 */
function detectModeSelection(prompt: string): SessionMode | null {
  const trimmed = prompt.trim().toLowerCase();

  // Check exact mode names first
  if (isValidSessionMode(trimmed)) {
    return trimmed;
  }

  // Check patterns
  for (const { pattern, mode } of MODE_SELECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return mode;
    }
  }

  return null;
}

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
      const truncated = words.slice(0, MAX_CONTEXT_WORDS).join(' ');
      // Try to truncate at sentence boundary for cleaner output
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf('. '),
        truncated.lastIndexOf('! '),
        truncated.lastIndexOf('? ')
      );
      // Only use sentence boundary if it's within the last 30% of content
      if (lastSentenceEnd > truncated.length * 0.7) {
        return truncated.slice(0, lastSentenceEnd + 1) + '\n[Truncated...]';
      }
      return truncated + '\n[Truncated...]';
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

    // ============================================
    // STEP -1: Check/Handle session mode selection
    // ============================================
    // Guard: Skip session features if no session_id provided
    if (!input.session_id) {
      // Continue without session mode features
      // This can happen in edge cases (e.g., direct CLI invocation)
    }

    const existingSession = input.session_id ? getSession(input.session_id) : null;

    // Check if this prompt is a mode selection (or mode switch)
    const selectedMode = detectModeSelection(input.prompt);
    if (selectedMode) {
      const modeInfo = SESSION_MODES.find(m => m.mode === selectedMode);

      if (!existingSession) {
        // User is selecting a mode for a new session
        createSession(input.session_id, selectedMode, {
          repoRoot: input.cwd,
        });

        const confirmation = modeInfo
          ? `Session mode set to **${modeInfo.label}**. ${modeInfo.description}.`
          : `Session mode set to ${selectedMode}.`;

        outputText(`[Matrix] ${confirmation}\n\nNow ready to help. What would you like to work on?`);
        process.exit(0);
      } else if (existingSession.mode !== selectedMode) {
        // User is switching modes mid-session
        updateSessionMode(input.session_id, selectedMode);

        const oldModeInfo = SESSION_MODES.find(m => m.mode === existingSession.mode);
        const confirmation = modeInfo
          ? `Switched from ${oldModeInfo?.label ?? existingSession.mode} to **${modeInfo.label}**. ${modeInfo.description}.`
          : `Switched to ${selectedMode} mode.`;

        outputText(`[Matrix] ${confirmation}`);
        process.exit(0);
      }
      // If same mode selected, continue normally (don't exit)
    }

    // If no session exists yet, create one with default mode (classic)
    // This happens when user didn't respond to mode prompt and just started working
    let currentSession = existingSession;
    if (!currentSession && input.session_id) {
      const { getConfig: getFullConfig } = await import('../config/index.js');
      const fullConfig = getFullConfig();
      const defaultMode = fullConfig.sessionModes?.defaultMode ?? 'classic';
      currentSession = createSession(input.session_id, defaultMode, {
        repoRoot: input.cwd,
      });
    }

    // Get mode-based behavior settings (using cached session)
    const threshold = getComplexityThreshold(input.session_id);
    const skipComplexity = !shouldRunComplexityAnalysis(input.session_id);
    const skipMemory = !shouldInjectMemory(input.session_id);

    // ============================================
    // STEP 0: Evaluate user-defined prompt rules
    // ============================================
    const ruleResult = evaluatePromptRules(input.prompt);

    if (ruleResult.blocked) {
      outputJson({
        hookSpecificOutput: {
          permissionDecision: 'deny',
          permissionDecisionReason: formatRuleResult(ruleResult),
        },
      });
      process.exit(0);
    }

    if (ruleResult.warned) {
      // Warnings don't block, but log them
      console.error(formatRuleResult(ruleResult));
    }

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
    // STEP 3: Estimate complexity (mode-aware)
    // ============================================
    // In quick/docs mode, skip complexity analysis entirely
    let complexity = { score: 0, reasoning: 'Skipped (quick mode)' };
    if (!skipComplexity) {
      complexity = await estimateComplexity(input.prompt);
    }

    // Skip memory injection if below threshold OR if mode says skip
    if (skipMemory || complexity.score < threshold) {
      // Still inject prompt agent context and code index if available (v2.0 verbosity-aware)
      const verbosity = getVerbosity();
      const lowComplexityParts: (string | null)[] = [];

      // Add mode context if applicable (use cached session)
      if (currentSession && currentSession.mode !== 'classic') {
        const modeCtx = formatModeContext(currentSession.mode);
        if (modeCtx) {
          lowComplexityParts.push(modeCtx);
        }
      }

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
    // STEP 4: Search Matrix memory (mode-aware)
    // ============================================
    // Get mode-specific limits
    const maxSolutions = getMaxSolutions(input.session_id);
    const maxFailures = getMaxFailures(input.session_id);

    const memoryConfig = config.promptAnalysis?.memoryInjection ?? {
      enabled: true,
      maxSolutions: 3,
      maxFailures: 2,
      minScore: 0.35,
    };

    // Use mode-based limits if set, otherwise fall back to config
    const effectiveMaxSolutions = maxSolutions > 0 ? maxSolutions : memoryConfig.maxSolutions;
    const effectiveMaxFailures = maxFailures >= 0 ? maxFailures : memoryConfig.maxFailures;

    const recallResult = await matrixRecall({
      query: input.prompt.slice(0, 500),
      limit: effectiveMaxSolutions,
      minScore: memoryConfig.minScore,
    });

    // Also search for related failures (mode-aware limit)
    const failures = await searchFailures(input.prompt.slice(0, 500), effectiveMaxFailures);

    // Format context
    const context = formatContext(
      recallResult.solutions,
      failures,
      complexity
    );

    // ============================================
    // STEP 5: Output combined context (v2.0 verbosity-aware + mode-aware)
    // ============================================
    const verbosity = getVerbosity();

    // Collect all context parts (some may be null)
    const contextParts: (string | null)[] = [];

    // Add mode context first if applicable (use cached session)
    if (currentSession && currentSession.mode !== 'classic') {
      const modeCtx = formatModeContext(currentSession.mode);
      if (modeCtx) {
        contextParts.push(modeCtx);
      }

      // In ultrathink mode, suggest plan mode for complex tasks
      if (shouldSuggestPlanMode(input.session_id, complexity.score)) {
        contextParts.push('[Matrix] Consider using EnterPlanMode for this task - it appears complex enough to benefit from upfront planning.');
      }
    }

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
