/**
 * Session Mode Types
 *
 * Defines the available session modes that control Matrix behavior.
 * Inspired by Claude's Constitution "Default vs Instructable Behaviors" concept.
 */

/**
 * Session modes control how Matrix behaves throughout a session.
 *
 * - ultrathink: Full power - aggressive memory, always suggest planning/review
 * - quick: Fast changes - minimal injection, no suggestions
 * - docs: Documentation focus - style recall only, no planning
 * - debug: Investigation - blast radius, failure recall, callers
 * - classic: No mode restrictions - follows config as before
 */
export type SessionMode = 'ultrathink' | 'quick' | 'docs' | 'debug' | 'classic';

/**
 * Session context stored for the duration of a session
 */
export interface SessionContext {
  sessionId: string;
  mode: SessionMode;
  startedAt: string;
  userName?: string;
  repoRoot?: string;
  repoId?: string;
}

/**
 * Mode display info for the selection prompt
 */
export interface ModeInfo {
  mode: SessionMode;
  label: string;
  description: string;
}

/**
 * All available modes with their display info
 */
export const SESSION_MODES: ModeInfo[] = [
  {
    mode: 'ultrathink',
    label: 'Ultrathink',
    description: 'Big feature? Plan first, full memory, review everything',
  },
  {
    mode: 'quick',
    label: 'Quick',
    description: 'Small fix? Skip the extras, just code',
  },
  {
    mode: 'docs',
    label: 'Docs',
    description: 'Writing docs? No injections, clean context',
  },
  {
    mode: 'debug',
    label: 'Debug',
    description: 'Hunting bugs? Past failures + blast radius',
  },
  {
    mode: 'classic',
    label: 'Classic',
    description: 'Not sure? Uses your config defaults',
  },
];

/**
 * Get mode info by mode name
 */
export function getModeInfo(mode: SessionMode): ModeInfo | undefined {
  return SESSION_MODES.find(m => m.mode === mode);
}

/**
 * Validate if a string is a valid session mode
 */
export function isValidSessionMode(mode: string): mode is SessionMode {
  return ['ultrathink', 'quick', 'docs', 'debug', 'classic'].includes(mode);
}
