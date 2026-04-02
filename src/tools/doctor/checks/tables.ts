/**
 * Database Table Checks
 *
 * - Hook Executions
 */

import { runMigrations } from '../../../db/migrate.js';
import { getDb } from '../../../db/index.js';
import type { DiagnosticCheck } from '../types.js';

/**
 * Check if a database table exists
 */
function tableExists(tableName: string): boolean {
  const db = getDb();
  const result = db.query(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name=?
  `).get(tableName);
  return result !== null;
}

/**
 * Check hook_executions table exists
 */
export function checkHookExecutions(): DiagnosticCheck {
  try {
    if (!tableExists('hook_executions')) {
      return {
        name: 'Hook Executions',
        status: 'warn',
        message: 'hook_executions table missing (run migrations)',
        autoFixable: true,
        fixAction: 'Run database migrations',
      };
    }

    return {
      name: 'Hook Executions',
      status: 'pass',
      message: 'Table exists for session tracking',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Hook Executions',
      status: 'warn',
      message: 'Check failed: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: true,
      fixAction: 'Run database migrations',
    };
  }
}

/**
 * Auto-fix table checks
 */
export async function fixTableCheck(check: DiagnosticCheck): Promise<DiagnosticCheck> {
  try {
    switch (check.name) {
      case 'Hook Executions':
        runMigrations();
        return { ...check, status: 'pass', fixed: true, message: 'Table created via migrations' };

      default:
        return check;
    }
  } catch (err) {
    return {
      ...check,
      fixed: false,
      message: 'Auto-fix failed: ' + (err instanceof Error ? err.message : 'Unknown'),
    };
  }
}
