/**
 * Mode Behavior Helper
 *
 * Centralized logic for how session modes affect hook behavior.
 * Inspired by Claude's Constitution "Default vs Instructable Behaviors" concept.
 *
 * Mode Behavior Matrix:
 * ┌────────────────────┬────────────┬───────┬──────┬───────┬─────────┐
 * │ Behavior           │ ultrathink │ quick │ docs │ debug │ classic │
 * ├────────────────────┼────────────┼───────┼──────┼───────┼─────────┤
 * │ Memory injection   │ full       │ light │ off  │ full  │ config  │
 * │ Suggest plan mode  │ always     │ never │ never│ maybe │ config  │
 * │ Suggest review     │ always     │ never │ never│ always│ config  │
 * │ Complexity analysis│ yes        │ skip  │ skip │ yes   │ config  │
 * │ Failure recall     │ yes        │ no    │ no   │ yes   │ config  │
 * │ Index priority     │ high       │ low   │ low  │ high  │ config  │
 * │ Deep research      │ yes        │ no    │ no   │ yes   │ config  │
 * └────────────────────┴────────────┴───────┴──────┴───────┴─────────┘
 */

import type { SessionMode } from '../types/session.js';
import { getSessionMode } from '../session/index.js';
import { getConfig } from '../config/index.js';

/**
 * Memory injection level
 */
export type MemoryInjectionLevel = 'full' | 'light' | 'off' | 'config';

/**
 * Behavior settings derived from session mode
 */
export interface ModeBehavior {
  /** Memory injection level */
  memoryInjection: MemoryInjectionLevel;
  /** Max solutions to inject (0 = none) */
  maxSolutions: number;
  /** Max failures to inject (0 = none) */
  maxFailures: number;
  /** Whether to run complexity analysis */
  runComplexityAnalysis: boolean;
  /** Whether to suggest entering plan mode */
  suggestPlanMode: 'always' | 'never' | 'smart' | 'config';
  /** Whether to suggest code review before commits */
  suggestReview: 'always' | 'never' | 'config';
  /** Index tools priority (affects which tools get suggested) */
  indexPriority: 'high' | 'low' | 'config';
  /** Whether to suggest deep research for complex queries */
  suggestDeepResearch: boolean;
  /** Minimum complexity threshold for memory injection (-1 = use config) */
  complexityThreshold: number;
}

/**
 * Mode behavior presets - maps mode to behavior settings
 * Values of -1 mean "use config setting"
 */
const MODE_BEHAVIORS: Record<SessionMode, ModeBehavior> = {
  ultrathink: {
    memoryInjection: 'full',
    maxSolutions: 5,
    maxFailures: 3,
    runComplexityAnalysis: true,
    suggestPlanMode: 'always',
    suggestReview: 'always',
    indexPriority: 'high',
    suggestDeepResearch: true,
    complexityThreshold: 3, // Lower = more aggressive
  },
  quick: {
    memoryInjection: 'light',
    maxSolutions: 1,
    maxFailures: 0,
    runComplexityAnalysis: false,
    suggestPlanMode: 'never',
    suggestReview: 'never',
    indexPriority: 'low',
    suggestDeepResearch: false,
    complexityThreshold: 10, // High = rarely triggers
  },
  docs: {
    memoryInjection: 'off',
    maxSolutions: 0,
    maxFailures: 0,
    runComplexityAnalysis: false,
    suggestPlanMode: 'never',
    suggestReview: 'never',
    indexPriority: 'low',
    suggestDeepResearch: false,
    complexityThreshold: 10,
  },
  debug: {
    memoryInjection: 'full',
    maxSolutions: 3,
    maxFailures: 5, // More failures for debugging context
    runComplexityAnalysis: true,
    suggestPlanMode: 'smart', // Only for complex investigations
    suggestReview: 'always',
    indexPriority: 'high',
    suggestDeepResearch: true,
    complexityThreshold: 4,
  },
  classic: {
    memoryInjection: 'config',
    maxSolutions: -1,
    maxFailures: -1,
    runComplexityAnalysis: true,
    suggestPlanMode: 'config',
    suggestReview: 'config',
    indexPriority: 'config',
    suggestDeepResearch: true,
    complexityThreshold: -1,
  },
};

/**
 * Get behavior settings for a session mode
 */
export function getModeBehavior(mode: SessionMode): ModeBehavior {
  return { ...MODE_BEHAVIORS[mode] };
}

/**
 * Get effective behavior for a session, merging mode with config
 */
export function getEffectiveBehavior(sessionId: string): ModeBehavior {
  const mode = getSessionMode(sessionId);
  const behavior = getModeBehavior(mode);
  const config = getConfig();

  // For 'classic' mode or 'config' values, use config settings
  if (behavior.memoryInjection === 'config' || mode === 'classic') {
    const memConfig = config.hooks.promptAnalysis?.memoryInjection;
    if (memConfig && !memConfig.enabled) {
      behavior.memoryInjection = 'off';
      behavior.maxSolutions = 0;
      behavior.maxFailures = 0;
    } else {
      behavior.memoryInjection = 'full';
      behavior.maxSolutions = memConfig?.maxSolutions ?? 3;
      behavior.maxFailures = memConfig?.maxFailures ?? 2;
    }
  }

  if (behavior.complexityThreshold === -1) {
    behavior.complexityThreshold = config.hooks.complexityThreshold ?? 5;
  }

  return behavior;
}

/**
 * Check if memory injection should run for this session
 */
export function shouldInjectMemory(sessionId: string): boolean {
  const behavior = getEffectiveBehavior(sessionId);
  return behavior.memoryInjection !== 'off' && behavior.maxSolutions > 0;
}

/**
 * Check if complexity analysis should run for this session
 */
export function shouldRunComplexityAnalysis(sessionId: string): boolean {
  const behavior = getEffectiveBehavior(sessionId);
  return behavior.runComplexityAnalysis;
}

/**
 * Check if plan mode should be suggested
 */
export function shouldSuggestPlanMode(sessionId: string, complexity: number): boolean {
  const behavior = getEffectiveBehavior(sessionId);

  switch (behavior.suggestPlanMode) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'smart':
      return complexity >= 6; // Suggest for moderately complex tasks
    case 'config':
    default:
      return false; // Config doesn't have plan mode suggestion yet
  }
}

/**
 * Check if code review should be suggested before commits
 */
export function shouldSuggestReview(sessionId: string): boolean {
  const behavior = getEffectiveBehavior(sessionId);
  const config = getConfig();

  switch (behavior.suggestReview) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'config':
    default:
      return config.hooks.gitCommitReview?.suggestOnCommit ?? true;
  }
}

/**
 * Get complexity threshold for this session
 */
export function getComplexityThreshold(sessionId: string): number {
  const behavior = getEffectiveBehavior(sessionId);
  return behavior.complexityThreshold;
}

/**
 * Get max solutions to inject for this session
 */
export function getMaxSolutions(sessionId: string): number {
  const behavior = getEffectiveBehavior(sessionId);
  if (behavior.maxSolutions === -1) {
    const config = getConfig();
    return config.hooks.promptAnalysis?.memoryInjection?.maxSolutions ?? 3;
  }
  return behavior.maxSolutions;
}

/**
 * Get max failures to inject for this session
 */
export function getMaxFailures(sessionId: string): number {
  const behavior = getEffectiveBehavior(sessionId);
  if (behavior.maxFailures === -1) {
    const config = getConfig();
    return config.hooks.promptAnalysis?.memoryInjection?.maxFailures ?? 2;
  }
  return behavior.maxFailures;
}

/**
 * Format mode for display in context injection
 */
export function formatModeContext(mode: SessionMode): string {
  const modeDescriptions: Record<SessionMode, string> = {
    ultrathink: 'Ultrathink mode: Full planning, thorough review, deep research enabled',
    quick: 'Quick mode: Minimal overhead, fast execution',
    docs: 'Docs mode: Documentation focus, light tooling',
    debug: 'Debug mode: Investigation focus, blast radius analysis enabled',
    classic: '', // No context injection for classic mode
  };

  return modeDescriptions[mode];
}
