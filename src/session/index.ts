/**
 * Session Store
 *
 * Manages session context persistence across hooks.
 * Sessions are stored in ~/.claude/matrix/sessions/
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import type { SessionContext, SessionMode } from '../types/session.js';

const SESSIONS_DIR = join(homedir(), '.claude', 'matrix', 'sessions');
const SESSION_TTL_HOURS = 24;

/**
 * Ensure sessions directory exists
 */
function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Get session file path
 */
function getSessionPath(sessionId: string): string {
  // Hash to prevent path traversal and ensure collision-free unique IDs
  const safeId = createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
  return join(SESSIONS_DIR, `session-${safeId}.json`);
}

/**
 * Create a new session context
 */
export function createSession(
  sessionId: string,
  mode: SessionMode,
  options?: {
    userName?: string;
    repoRoot?: string;
    repoId?: string;
  }
): SessionContext {
  ensureSessionsDir();

  const context: SessionContext = {
    sessionId,
    mode,
    startedAt: new Date().toISOString(),
    userName: options?.userName,
    repoRoot: options?.repoRoot,
    repoId: options?.repoId,
  };

  const path = getSessionPath(sessionId);
  writeFileSync(path, JSON.stringify(context, null, 2));

  return context;
}

/**
 * Get session context by ID
 * Returns null if session doesn't exist or is expired
 */
export function getSession(sessionId: string): SessionContext | null {
  const path = getSessionPath(sessionId);

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const context = JSON.parse(content) as SessionContext;

    // Check if session is expired
    const startedAt = new Date(context.startedAt);
    const now = new Date();
    const hoursSinceStart = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceStart > SESSION_TTL_HOURS) {
      // Clean up expired session
      try {
        unlinkSync(path);
      } catch {
        // Ignore cleanup errors
      }
      return null;
    }

    return context;
  } catch {
    return null;
  }
}

/**
 * Update session mode
 */
export function updateSessionMode(sessionId: string, mode: SessionMode): boolean {
  const context = getSession(sessionId);
  if (!context) {
    return false;
  }

  context.mode = mode;
  const path = getSessionPath(sessionId);
  writeFileSync(path, JSON.stringify(context, null, 2));

  return true;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  const path = getSessionPath(sessionId);

  if (!existsSync(path)) {
    return false;
  }

  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up expired sessions
 * Called periodically to remove stale session files
 */
export function cleanupExpiredSessions(): number {
  ensureSessionsDir();

  let cleaned = 0;
  const now = new Date();

  try {
    const files = readdirSync(SESSIONS_DIR);

    for (const file of files) {
      if (!file.startsWith('session-') || !file.endsWith('.json')) {
        continue;
      }

      const path = join(SESSIONS_DIR, file);

      try {
        const content = readFileSync(path, 'utf-8');
        const context = JSON.parse(content) as SessionContext;
        const startedAt = new Date(context.startedAt);
        const hoursSinceStart = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceStart > SESSION_TTL_HOURS) {
          unlinkSync(path);
          cleaned++;
        }
      } catch {
        // Invalid file, remove it
        try {
          unlinkSync(path);
          cleaned++;
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Ignore directory read errors
  }

  return cleaned;
}

/**
 * Get session mode with fallback to classic
 * Convenience function for hooks
 */
export function getSessionMode(sessionId: string): SessionMode {
  const context = getSession(sessionId);
  return context?.mode ?? 'classic';
}

/**
 * Check if a session exists and has a specific mode
 */
export function hasMode(sessionId: string, mode: SessionMode): boolean {
  const context = getSession(sessionId);
  return context?.mode === mode;
}

/**
 * List all active sessions (for debugging)
 */
export function listSessions(): SessionContext[] {
  ensureSessionsDir();

  const sessions: SessionContext[] = [];
  const now = new Date();

  try {
    const files = readdirSync(SESSIONS_DIR);

    for (const file of files) {
      if (!file.startsWith('session-') || !file.endsWith('.json')) {
        continue;
      }

      const path = join(SESSIONS_DIR, file);

      try {
        const content = readFileSync(path, 'utf-8');
        const context = JSON.parse(content) as SessionContext;
        const startedAt = new Date(context.startedAt);
        const hoursSinceStart = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceStart <= SESSION_TTL_HOURS) {
          sessions.push(context);
        }
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Ignore errors
  }

  return sessions;
}
