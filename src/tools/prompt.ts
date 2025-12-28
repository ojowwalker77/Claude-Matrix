/**
 * Prompt Agent - Analyze, clarify, and optimize prompts before execution
 *
 * The meta-agent that intercepts user prompts, analyzes them for ambiguity,
 * and either returns an optimized prompt or asks clarification questions.
 *
 * Core logic is extracted to src/hooks/prompt-utils.ts for reuse in hooks.
 */

import { matrixRecall } from './recall.js';
import { searchFailures } from './failure.js';
import { estimateComplexity } from '../hooks/complexity.js';
import {
  detectShortcut,
  analyzeAmbiguity,
  loadClaudeMdContext,
  getGitContext,
  generateAssumptions,
  calculateConfidence,
  type Assumption,
} from '../hooks/prompt-utils.js';

export interface PromptInput {
  rawPrompt: string;
  mode?: 'interactive' | 'auto' | 'spawn';
  skipClarification?: boolean;
  context?: {
    recentFiles?: string[];
    gitBranch?: string;
    gitDiff?: string;
  };
}

export interface ClarificationQuestion {
  question: string;
  type: 'scope' | 'target' | 'approach' | 'action';
  options?: string[];
}

export interface PromptResult {
  optimizedPrompt: string;
  confidence: number;
  assumptions: Assumption[];
  requiresApproval: boolean;
  clarificationNeeded?: ClarificationQuestion;
  shortcutDetected?: {
    trigger: string;
    action: string;
  };
  contextInjected: {
    fromClaudeMd: string[];
    fromGit: string[];
    fromMemory: string[];
  };
  complexity: {
    score: number;
    reasoning: string;
  };
}

/**
 * Get Matrix memory context
 */
async function getMemoryContext(prompt: string): Promise<string[]> {
  const contexts: string[] = [];

  try {
    // Search for relevant solutions
    const recallResult = await matrixRecall({
      query: prompt.slice(0, 500),
      limit: 2,
      minScore: 0.4,
    });

    if (recallResult.solutions.length > 0) {
      for (const sol of recallResult.solutions) {
        const preview = sol.solution.slice(0, 150);
        contexts.push(`[Matrix Solution ${sol.id}] ${sol.problem.slice(0, 100)} → ${preview}`);
      }
    }

    // Search for related failures
    const failures = await searchFailures(prompt.slice(0, 300), 1);
    if (failures.length > 0) {
      const fail = failures[0];
      if (fail) {
        contexts.push(`[Matrix Warning] Avoid: ${fail.errorMessage.slice(0, 100)}`);
      }
    }
  } catch {
    // Matrix not available
  }

  return contexts;
}

/**
 * Optimize the prompt based on context
 */
function optimizePrompt(
  rawPrompt: string,
  assumptions: Assumption[],
  memoryContext: string[]
): string {
  let optimized = rawPrompt.trim();

  // Add context hints for Claude
  const hints: string[] = [];

  // Add relevant assumptions
  const highConfidenceAssumptions = assumptions.filter(a => a.confidence > 0.7);
  if (highConfidenceAssumptions.length > 0) {
    for (const a of highConfidenceAssumptions) {
      hints.push(`[Assumed: ${a.assumption}]`);
    }
  }

  // Reference relevant memory
  if (memoryContext.length > 0) {
    hints.push('[Matrix memory available - use matrix_recall for details]');
  }

  if (hints.length > 0) {
    optimized = `${optimized}\n\n---\nContext: ${hints.join(' ')}`;
  }

  return optimized;
}

/**
 * Main Prompt Agent function
 */
export async function matrixPrompt(input: PromptInput): Promise<PromptResult> {
  const { rawPrompt, mode = 'interactive', skipClarification = false } = input;

  // Check for shortcuts
  const shortcut = detectShortcut(rawPrompt);
  if (shortcut) {
    if (shortcut.action === 'abort') {
      return {
        optimizedPrompt: '',
        confidence: 0,
        assumptions: [],
        requiresApproval: false,
        shortcutDetected: shortcut,
        contextInjected: { fromClaudeMd: [], fromGit: [], fromMemory: [] },
        complexity: { score: 0, reasoning: 'Aborted by user' },
      };
    }
    if (shortcut.action === 'execute') {
      // Strip the shortcut and use remaining prompt, preserving original casing
      const cleanPrompt = rawPrompt.replace(new RegExp(`\\b${shortcut.trigger}\\b`, 'i'), '').trim();
      if (!cleanPrompt) {
        return {
          optimizedPrompt: '[Execute previous with best judgment]',
          confidence: 85,
          assumptions: [{ category: 'action', assumption: 'User wants to proceed with inferred plan', confidence: 0.9 }],
          requiresApproval: false,
          shortcutDetected: shortcut,
          contextInjected: { fromClaudeMd: [], fromGit: [], fromMemory: [] },
          complexity: { score: 5, reasoning: 'Quick execution' },
        };
      }
    }
  }

  // Load context in parallel
  const [claudeMdContext, gitContext, memoryContext, complexity] = await Promise.all([
    Promise.resolve(loadClaudeMdContext()),
    getGitContext(),
    getMemoryContext(rawPrompt),
    estimateComplexity(rawPrompt),
  ]);

  // Analyze ambiguity
  const ambiguity = skipClarification ? null : analyzeAmbiguity(rawPrompt);

  // Generate assumptions
  const assumptions = generateAssumptions(rawPrompt, claudeMdContext, gitContext);

  // Calculate confidence
  const confidence = calculateConfidence(rawPrompt, ambiguity, assumptions, memoryContext);

  // Determine if approval is needed based on mode and confidence
  const thresholds = {
    interactive: 80,
    auto: 90,
    spawn: 85,
  };
  const threshold = thresholds[mode];
  const requiresApproval = confidence < threshold;

  // Optimize the prompt
  const optimizedPrompt = optimizePrompt(rawPrompt, assumptions, memoryContext);

  // Decide on clarification
  let clarificationNeeded: ClarificationQuestion | undefined;
  if (ambiguity && confidence < 70 && mode !== 'auto') {
    clarificationNeeded = ambiguity;
  }

  return {
    optimizedPrompt,
    confidence,
    assumptions,
    requiresApproval,
    clarificationNeeded,
    shortcutDetected: shortcut || undefined,
    contextInjected: {
      fromClaudeMd: claudeMdContext,
      fromGit: gitContext,
      fromMemory: memoryContext,
    },
    complexity: {
      score: complexity.score,
      reasoning: complexity.reasoning,
    },
  };
}
