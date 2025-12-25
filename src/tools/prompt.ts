/**
 * Prompt Agent - Analyze, clarify, and optimize prompts before execution
 *
 * The meta-agent that intercepts user prompts, analyzes them for ambiguity,
 * and either returns an optimized prompt or asks clarification questions.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { matrixRecall } from './recall.js';
import { searchFailures } from './failure.js';
import { estimateComplexity } from '../hooks/complexity.js';

// Shortcut patterns for quick responses
const SHORTCUTS: Record<string, { action: 'execute' | 'abort' | 'expand' | 'hierarchize' | 'skip'; label: string }> = {
  'ship it': { action: 'execute', label: 'Execute with best interpretation' },
  'just do it': { action: 'execute', label: 'Execute with best interpretation' },
  'yolo': { action: 'execute', label: 'Execute with best interpretation' },
  'go ahead': { action: 'execute', label: 'Execute with best interpretation' },
  'proceed': { action: 'execute', label: 'Execute with best interpretation' },
  'nah': { action: 'abort', label: 'Abort, user will rephrase' },
  'nope': { action: 'abort', label: 'Abort, user will rephrase' },
  'abort': { action: 'abort', label: 'Abort, user will rephrase' },
  'cancel': { action: 'abort', label: 'Abort, user will rephrase' },
  'expand': { action: 'expand', label: 'Show more granular options' },
  'more options': { action: 'expand', label: 'Show more granular options' },
  'hierarchize': { action: 'hierarchize', label: 'Create subtask plan' },
  'break it down': { action: 'hierarchize', label: 'Create subtask plan' },
  'skip': { action: 'skip', label: 'Skip question, use judgment' },
};

// Ambiguity patterns
const AMBIGUITY_PATTERNS = {
  scope: {
    patterns: [
      /\b(this|that|it|the)\s+(code|function|file|module|component)\b/i,
      /\b(fix|update|change|refactor|improve)\s+(it|this|that)\b/i,
      /\bthe\s+(bug|issue|problem|error)\b/i,
    ],
    question: 'Which specific file/component are you referring to?',
    type: 'scope' as const,
  },
  target: {
    patterns: [
      /\b(something|somewhere|somehow)\b/i,
      /\b(some|few|couple)\s+(of\s+)?(files?|functions?|components?)\b/i,
      /\b(here|there)\b/i,
    ],
    question: 'Can you specify the exact location or target?',
    type: 'target' as const,
  },
  approach: {
    patterns: [
      /\b(better|improve|optimize|enhance|make\s+it\s+(good|nice|clean))\b/i,
      /\b(properly|correctly|right\s+way)\b/i,
      /\b(best\s+practice|standard|convention)\b/i,
    ],
    question: 'What specific improvement are you looking for?',
    type: 'approach' as const,
  },
  action: {
    patterns: [
      /^(fix|handle|deal\s+with)\s+(the\s+)?(auth|error|bug|issue)$/i,
      /^(add|implement|create)\s+(a\s+)?(feature|functionality)$/i,
    ],
    question: 'What exactly should be fixed/implemented?',
    type: 'action' as const,
  },
};

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

export interface Assumption {
  category: string;
  assumption: string;
  confidence: number;
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
 * Load CLAUDE.md files (project + global)
 */
function loadClaudeMdContext(): string[] {
  const contexts: string[] = [];
  const cwd = process.cwd();

  // Project-level CLAUDE.md
  const projectClaudeMd = join(cwd, 'CLAUDE.md');
  if (existsSync(projectClaudeMd)) {
    try {
      const content = readFileSync(projectClaudeMd, 'utf-8');
      // Extract relevant sections (preferences, patterns)
      const relevantSections = extractRelevantSections(content);
      if (relevantSections) {
        contexts.push(`[Project CLAUDE.md] ${relevantSections}`);
      }
    } catch {
      // Ignore read errors
    }
  }

  // Global CLAUDE.md
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const globalClaudeMd = join(home, '.claude', 'CLAUDE.md');
  if (existsSync(globalClaudeMd)) {
    try {
      const content = readFileSync(globalClaudeMd, 'utf-8');
      const relevantSections = extractRelevantSections(content);
      if (relevantSections) {
        contexts.push(`[Global CLAUDE.md] ${relevantSections}`);
      }
    } catch {
      // Ignore read errors
    }
  }

  return contexts;
}

/**
 * Extract relevant sections from CLAUDE.md
 */
function extractRelevantSections(content: string): string | null {
  const relevantKeywords = [
    'preference',
    'style',
    'convention',
    'pattern',
    'avoid',
    'always',
    'never',
    'use',
    'don\'t',
  ];

  const lines = content.split('\n');
  const relevant: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (relevantKeywords.some(kw => lower.includes(kw))) {
      relevant.push(line.trim());
    }
  }

  return relevant.length > 0 ? relevant.slice(0, 10).join('; ') : null;
}

/**
 * Get git context
 */
async function getGitContext(): Promise<string[]> {
  const contexts: string[] = [];

  try {
    // Get current branch
    const branchProc = Bun.spawn(['git', 'branch', '--show-current'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const branchOutput = await new Response(branchProc.stdout).text();
    const branch = branchOutput.trim();
    if (branch) {
      contexts.push(`[Git Branch] ${branch}`);
    }

    // Get recent commit messages (last 3)
    const logProc = Bun.spawn(['git', 'log', '--oneline', '-3'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const logOutput = await new Response(logProc.stdout).text();
    if (logOutput.trim()) {
      contexts.push(`[Recent Commits] ${logOutput.trim().replace(/\n/g, '; ')}`);
    }

    // Get changed files (staged + unstaged)
    const statusProc = Bun.spawn(['git', 'status', '--short'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const statusOutput = await new Response(statusProc.stdout).text();
    if (statusOutput.trim()) {
      const files = statusOutput.trim().split('\n').slice(0, 5);
      contexts.push(`[Changed Files] ${files.join('; ')}`);
    }
  } catch {
    // Not a git repo or git not available
  }

  return contexts;
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
 * Detect shortcut in prompt
 */
function detectShortcut(prompt: string): { trigger: string; action: string } | null {
  const normalized = prompt.toLowerCase().trim();

  for (const [trigger, info] of Object.entries(SHORTCUTS)) {
    if (normalized === trigger || normalized.startsWith(`${trigger} `) || normalized.endsWith(` ${trigger}`)) {
      return { trigger, action: info.action };
    }
  }

  return null;
}

/**
 * Analyze prompt for ambiguity
 */
function analyzeAmbiguity(prompt: string): ClarificationQuestion | null {
  const ambiguities: { type: ClarificationQuestion['type']; question: string; priority: number }[] = [];

  for (const [_key, config] of Object.entries(AMBIGUITY_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(prompt)) {
        ambiguities.push({
          type: config.type,
          question: config.question,
          priority: config.patterns.length, // More patterns = higher priority
        });
        break;
      }
    }
  }

  if (ambiguities.length === 0) {
    return null;
  }

  // Return highest priority ambiguity
  ambiguities.sort((a, b) => b.priority - a.priority);
  const top = ambiguities[0];
  if (!top) {
    return null;
  }

  return {
    question: top.question,
    type: top.type,
  };
}

/**
 * Generate assumptions based on context
 */
function generateAssumptions(
  prompt: string,
  claudeMdContext: string[],
  gitContext: string[]
): Assumption[] {
  const assumptions: Assumption[] = [];

  // Infer from git branch
  const branchContext = gitContext.find(c => c.includes('[Git Branch]'));
  if (branchContext) {
    const branch = branchContext.replace('[Git Branch] ', '');
    if (branch.includes('feature/')) {
      assumptions.push({
        category: 'scope',
        assumption: `Working on feature: ${branch.replace('feature/', '')}`,
        confidence: 0.8,
      });
    } else if (branch.includes('fix/') || branch.includes('bugfix/')) {
      assumptions.push({
        category: 'task',
        assumption: 'This is a bug fix task',
        confidence: 0.9,
      });
    }
  }

  // Infer from changed files
  const changedContext = gitContext.find(c => c.includes('[Changed Files]'));
  if (changedContext && prompt.toLowerCase().includes('continue')) {
    assumptions.push({
      category: 'scope',
      assumption: `Continue work on recently changed files`,
      confidence: 0.7,
    });
  }

  // Infer from CLAUDE.md preferences
  if (claudeMdContext.length > 0) {
    assumptions.push({
      category: 'style',
      assumption: 'Following project/personal conventions from CLAUDE.md',
      confidence: 0.95,
    });
  }

  return assumptions;
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  prompt: string,
  ambiguity: ClarificationQuestion | null,
  assumptions: Assumption[],
  memoryContext: string[]
): number {
  let confidence = 70; // Base confidence

  // Reduce for ambiguity
  if (ambiguity) {
    confidence -= 20;
  }

  // Reduce for very short prompts
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount < 5) {
    confidence -= 15;
  } else if (wordCount > 20) {
    confidence += 10;
  }

  // Boost for having relevant memory
  if (memoryContext.length > 0) {
    confidence += 10;
  }

  // Boost for high-confidence assumptions
  const highConfidenceAssumptions = assumptions.filter(a => a.confidence > 0.8);
  confidence += highConfidenceAssumptions.length * 5;

  // Reduce for vague action words
  if (/\b(somehow|something|maybe|possibly|perhaps)\b/i.test(prompt)) {
    confidence -= 10;
  }

  // Boost for specific file references
  if (/\.(ts|js|py|go|rs|java|tsx|jsx|json|yaml|yml|md)\b/.test(prompt)) {
    confidence += 10;
  }

  return Math.max(10, Math.min(100, confidence));
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
