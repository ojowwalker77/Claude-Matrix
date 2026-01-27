/**
 * Database Table Checks
 *
 * - Background Jobs
 * - Hook Executions
 * - Dreamer Scheduler
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
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
 * Create a diagnostic check result for a missing table
 */
function missingTableCheck(name: string, tableName: string): DiagnosticCheck {
  return {
    name,
    status: 'warn',
    message: tableName + ' table missing (run migrations)',
    autoFixable: true,
    fixAction: 'Run database migrations',
  };
}

/**
 * Check background_jobs table exists (v2.0+ feature)
 */
export function checkBackgroundJobs(): DiagnosticCheck {
  try {
    if (!tableExists('background_jobs')) {
      return missingTableCheck('Background Jobs', 'background_jobs');
    }

    const db = getDb();
    const orphaned = db.query(`
      SELECT COUNT(*) as count FROM background_jobs
      WHERE status = 'running' AND pid IS NOT NULL
    `).get() as { count: number };

    if (orphaned.count > 0) {
      return {
        name: 'Background Jobs',
        status: 'warn',
        message: orphaned.count + ' orphaned running jobs found',
        autoFixable: true,
        fixAction: 'Clean up orphaned jobs',
      };
    }

    return {
      name: 'Background Jobs',
      status: 'pass',
      message: 'Table exists, no orphaned jobs',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Background Jobs',
      status: 'warn',
      message: 'Check failed: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: true,
      fixAction: 'Run database migrations',
    };
  }
}

/**
 * Check hook_executions table exists (v2.0+ feature)
 */
export function checkHookExecutions(): DiagnosticCheck {
  try {
    if (!tableExists('hook_executions')) {
      return missingTableCheck('Hook Executions', 'hook_executions');
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
 * Check Dreamer scheduler tables and registration
 */
export function checkDreamer(): DiagnosticCheck {
  try {
    if (!tableExists('dreamer_tasks')) {
      return missingTableCheck('Dreamer Scheduler', 'dreamer_tasks');
    }

    if (!tableExists('dreamer_executions')) {
      return missingTableCheck('Dreamer Scheduler', 'dreamer_executions');
    }

    const db = getDb();
    const taskCount = db.query(`
      SELECT COUNT(*) as count FROM dreamer_tasks WHERE enabled = 1
    `).get() as { count: number };

    const platform = process.platform;
    let schedulerStatus = 'unknown';

    if (platform === 'darwin') {
      const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');
      if (existsSync(launchAgentsDir)) {
        const files = readdirSync(launchAgentsDir);
        const dreamerPlists = files.filter(f => f.startsWith('com.claude.dreamer.'));
        schedulerStatus = dreamerPlists.length + ' launchd agents';
      } else {
        schedulerStatus = 'LaunchAgents dir missing';
      }
    } else if (platform === 'linux') {
      const result = spawnSync('crontab', ['-l'], { encoding: 'utf-8' });
      if (result.status === 0) {
        const lines = result.stdout.split('\n').filter(l => l.includes('claude-dreamer'));
        schedulerStatus = lines.length + ' cron entries';
      } else {
        schedulerStatus = 'crontab not accessible';
      }
    } else {
      schedulerStatus = 'unsupported platform';
    }

    return {
      name: 'Dreamer Scheduler',
      status: 'pass',
      message: taskCount.count + ' tasks enabled, ' + schedulerStatus,
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Dreamer Scheduler',
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
      case 'Background Jobs':
        if (check.message.includes('orphaned')) {
          const db = getDb();
          db.query(`
            UPDATE background_jobs
            SET status = 'failed', error = 'Orphaned job cleaned up by doctor', completed_at = datetime('now')
            WHERE status = 'running' AND pid IS NOT NULL
          `).run();
          return { ...check, status: 'pass', fixed: true, message: 'Orphaned jobs cleaned up' };
        }
        runMigrations();
        return { ...check, status: 'pass', fixed: true, message: 'Table created via migrations' };

      case 'Hook Executions':
        runMigrations();
        return { ...check, status: 'pass', fixed: true, message: 'Table created via migrations' };

      case 'Dreamer Scheduler':
        runMigrations();
        return { ...check, status: 'pass', fixed: true, message: 'Tables created via migrations' };

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
