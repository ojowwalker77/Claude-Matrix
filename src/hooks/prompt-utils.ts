/**
 * Prompt Analysis Utilities
 *
 * Reusable functions for prompt analysis, extracted from the Prompt Agent.
 * Used by both UserPromptSubmit hook (silent mode) and matrixPrompt tool (interactive).
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  formatGitContext,
  formatPromptContext,
  assembleContext,
  getVerbosity,
  type GitContextData,
} from './format-helpers.js';

// Shortcut patterns for quick responses
export const SHORTCUTS: Record<string, { action: 'execute' | 'abort' | 'expand' | 'hierarchize' | 'skip'; label: string }> = {
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
export const AMBIGUITY_PATTERNS = {
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

export interface Shortcut {
  trigger: string;
  action: 'execute' | 'abort' | 'expand' | 'hierarchize' | 'skip';
}

export interface AmbiguityResult {
  type: 'scope' | 'target' | 'approach' | 'action';
  question: string;
}

export interface Assumption {
  category: string;
  assumption: string;
  confidence: number;
}

export interface PromptContext {
  claudeMd: string[];
  git: string[];
  memory: string[];
}

export interface SilentAnalysisResult {
  shortcut: Shortcut | null;
  ambiguity: AmbiguityResult | null;
  confidence: number;
  assumptions: Assumption[];
  contextInjected: string[];
}

/**
 * Detect shortcut in prompt
 */
export function detectShortcut(prompt: string): Shortcut | null {
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
export function analyzeAmbiguity(prompt: string): AmbiguityResult | null {
  const ambiguities: { type: AmbiguityResult['type']; question: string; priority: number }[] = [];

  for (const [_key, config] of Object.entries(AMBIGUITY_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(prompt)) {
        ambiguities.push({
          type: config.type,
          question: config.question,
          priority: config.patterns.length,
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
 * Load CLAUDE.md files (project + global)
 */
export function loadClaudeMdContext(cwd?: string): string[] {
  const contexts: string[] = [];
  const workingDir = cwd || process.cwd();

  // Project-level CLAUDE.md
  const projectClaudeMd = join(workingDir, 'CLAUDE.md');
  if (existsSync(projectClaudeMd)) {
    try {
      const content = readFileSync(projectClaudeMd, 'utf-8');
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
 * Run a git command with proper stream cleanup
 * Ensures no resource leaks even on error/timeout
 */
async function runGitCommand(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  try {
    const output = await new Response(proc.stdout).text();
    await proc.exited; // Wait for process to fully exit
    return output.trim();
  } finally {
    // Ensure streams are closed even on error
    try {
      proc.stdout.cancel();
    } catch {
      /* already closed */
    }
    try {
      proc.stderr.cancel();
    } catch {
      /* already closed */
    }
    try {
      proc.kill();
    } catch {
      /* already dead */
    }
  }
}

/**
 * Get git context as structured data (v2.0)
 * Returns raw data for verbosity-aware formatting
 */
export async function getGitContextData(cwd?: string): Promise<GitContextData> {
  const workingDir = cwd || process.cwd();
  const result: GitContextData = {
    branch: null,
    commits: [],
    changedFiles: [],
  };

  try {
    // Get current branch
    const branchOutput = await runGitCommand(['branch', '--show-current'], workingDir);
    result.branch = branchOutput || null;

    // Get recent commit messages (last 3)
    const logOutput = await runGitCommand(['log', '--oneline', '-3'], workingDir);
    if (logOutput) {
      result.commits = logOutput.split('\n');
    }

    // Get changed files (staged + unstaged)
    const statusOutput = await runGitCommand(['status', '--short'], workingDir);
    if (statusOutput) {
      result.changedFiles = statusOutput.split('\n').slice(0, 10);
    }
  } catch {
    // Not a git repo or git not available
  }

  return result;
}

/**
 * Get git context (backward compatible wrapper)
 * @deprecated Use getGitContextData() + formatGitContext() instead
 */
export async function getGitContext(cwd?: string): Promise<string[]> {
  const data = await getGitContextData(cwd);
  const formatted = formatGitContext(data, 'full');
  return formatted ? formatted.split('\n') : [];
}

/**
 * Generate assumptions based on context
 */
export function generateAssumptions(
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
export function calculateConfidence(
  prompt: string,
  ambiguity: AmbiguityResult | null,
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
 * Run silent prompt analysis (non-interactive, for hooks)
 *
 * Returns analysis without blocking or asking questions.
 * Used by UserPromptSubmit hook for shortcut/ambiguity detection.
 *
 * Note: Git context and CLAUDE.md parsing removed — Claude Code already
 * provides both natively. This eliminates 3 subprocess spawns + file I/O
 * per prompt.
 */
export async function analyzePromptSilent(
  prompt: string,
  _cwd?: string
): Promise<SilentAnalysisResult> {
  // Check for shortcuts first
  const shortcut = detectShortcut(prompt);

  // If abort shortcut, return early
  if (shortcut?.action === 'abort') {
    return {
      shortcut,
      ambiguity: null,
      confidence: 0,
      assumptions: [],
      contextInjected: [],
    };
  }

  // Analyze ambiguity (for warning, not blocking)
  const ambiguity = analyzeAmbiguity(prompt);

  return {
    shortcut,
    ambiguity,
    confidence: 70, // Base confidence — detailed scoring moved to matrix_prompt tool
    assumptions: [],
    contextInjected: [],
  };
}
