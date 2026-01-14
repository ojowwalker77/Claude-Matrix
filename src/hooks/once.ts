/**
 * Once - One-time hook execution tracking
 *
 * Provides helpers for hooks that should only run once per session.
 * Uses database to track execution state.
 *
 * Usage:
 *   import { hasRunThisSession, markAsRun } from './once.js';
 *
 *   if (hasRunThisSession('my-hook', sessionId)) {
 *     process.exit(0);  // Already ran
 *   }
 *   // Do work...
 *   markAsRun('my-hook', sessionId);
 */

import { getDb } from '../db/index.js';

/**
 * Check if a hook has already been executed in this session
 *
 * @param hookName - Unique identifier for the hook (e.g., 'session-start-setup')
 * @param sessionId - Current session ID from hook input
 * @returns true if hook has already executed this session
 */
export function hasRunThisSession(hookName: string, sessionId: string): boolean {
  try {
    const db = getDb();
    const row = db
      .query('SELECT 1 FROM hook_executions WHERE hook_name = ? AND session_id = ?')
      .get(hookName, sessionId);
    return !!row;
  } catch {
    // If database is unavailable, assume not run (allow execution)
    return false;
  }
}

/**
 * Mark a hook as having been executed in this session
 *
 * @param hookName - Unique identifier for the hook
 * @param sessionId - Current session ID from hook input
 */
export function markAsRun(hookName: string, sessionId: string): void {
  try {
    const db = getDb();
    db.query(
      'INSERT OR IGNORE INTO hook_executions (hook_name, session_id) VALUES (?, ?)'
    ).run(hookName, sessionId);
  } catch {
    // Silently ignore - hook will run again next time if this fails
  }
}

/**
 * Clear execution record for a hook (useful for testing or forced re-run)
 *
 * @param hookName - Unique identifier for the hook
 * @param sessionId - Current session ID (optional - if not provided, clears all sessions)
 */
export function clearExecution(hookName: string, sessionId?: string): void {
  try {
    const db = getDb();
    if (sessionId) {
      db.query('DELETE FROM hook_executions WHERE hook_name = ? AND session_id = ?').run(
        hookName,
        sessionId
      );
    } else {
      db.query('DELETE FROM hook_executions WHERE hook_name = ?').run(hookName);
    }
  } catch {
    // Silently ignore
  }
}

/**
 * Clean up old execution records (older than 7 days)
 * Called periodically to prevent table bloat
 */
export function cleanupOldExecutions(): void {
  try {
    const db = getDb();
    db.query(
      "DELETE FROM hook_executions WHERE executed_at < datetime('now', '-7 days')"
    ).run();
  } catch {
    // Silently ignore
  }
}
