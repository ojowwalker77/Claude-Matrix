/**
 * Core Infrastructure Checks
 *
 * - Matrix Directory
 * - Database
 * - Configuration
 * - Config Migration
 */

import { existsSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { runMigrations } from '../../../db/migrate.js';
import { getDb } from '../../../db/index.js';
import { getSchemaVersion } from '../../../db/migrate.js';
import { getConfig, saveConfig, clearCache } from '../../../config/index.js';
import type { DiagnosticCheck } from '../types.js';

export const MATRIX_DIR = join(homedir(), '.claude', 'matrix');

/**
 * Check if Matrix directory exists and is writable
 */
export function checkMatrixDir(): DiagnosticCheck {
  if (!existsSync(MATRIX_DIR)) {
    return {
      name: 'Matrix Directory',
      status: 'fail',
      message: 'Directory not found: ' + MATRIX_DIR,
      autoFixable: true,
      fixAction: 'Create directory',
    };
  }

  try {
    const stat = statSync(MATRIX_DIR);
    if (!stat.isDirectory()) {
      return {
        name: 'Matrix Directory',
        status: 'fail',
        message: MATRIX_DIR + ' exists but is not a directory',
        autoFixable: false,
      };
    }
    return {
      name: 'Matrix Directory',
      status: 'pass',
      message: 'Exists: ' + MATRIX_DIR,
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Matrix Directory',
      status: 'fail',
      message: 'Cannot access: ' + (err instanceof Error ? err.message : 'Unknown error'),
      autoFixable: false,
    };
  }
}

/**
 * Check database connection and schema
 */
export function checkDatabase(): DiagnosticCheck {
  const dbPath = join(MATRIX_DIR, 'matrix.db');

  try {
    const db = getDb();
    const version = getSchemaVersion();

    if (version.current < version.latest) {
      return {
        name: 'Database',
        status: 'warn',
        message: 'Schema outdated: v' + version.current + ' (latest: v' + version.latest + ')',
        autoFixable: true,
        fixAction: 'Run migrations (preserves all data)',
      };
    }

    const result = db.query('SELECT COUNT(*) as count FROM solutions').get() as { count: number };

    return {
      name: 'Database',
      status: 'pass',
      message: 'Connected, schema v' + version.current + ', ' + result.count + ' solutions',
      autoFixable: false,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';

    if (existsSync(dbPath)) {
      return {
        name: 'Database',
        status: 'fail',
        message: 'Database corrupted: ' + errorMsg + '. Backup: ' + dbPath,
        autoFixable: false,
      };
    }

    return {
      name: 'Database',
      status: 'fail',
      message: 'Database not found',
      autoFixable: true,
      fixAction: 'Create new database',
    };
  }
}

/**
 * Check config file for missing sections
 */
function findMissingConfigSections(config: ReturnType<typeof getConfig>): string[] {
  const missing: string[] = [];

  if (!config.hooks) missing.push('hooks');
  if (!config.hooks?.promptAnalysis) missing.push('hooks.promptAnalysis');
  if (!config.hooks?.promptAnalysis?.memoryInjection) missing.push('hooks.promptAnalysis.memoryInjection');
  if (!config.hooks?.permissions) missing.push('hooks.permissions');
  if (!config.hooks?.preCompact) missing.push('hooks.preCompact');
  if (!config.hooks?.sensitiveFiles) missing.push('hooks.sensitiveFiles');
  if (!config.hooks?.stop) missing.push('hooks.stop');
  if (!config.hooks?.packageAuditor) missing.push('hooks.packageAuditor');
  if (!config.hooks?.cursedFiles) missing.push('hooks.cursedFiles');
  if (!config.hooks?.userRules) missing.push('hooks.userRules');
  if (!config.indexing) missing.push('indexing');
  if (!config.toolSearch) missing.push('toolSearch');
  if (!config.delegation) missing.push('delegation');
  if (!config.dreamer) missing.push('dreamer');
  if (!config.dreamer?.worktree) missing.push('dreamer.worktree');
  if (!config.dreamer?.execution) missing.push('dreamer.execution');

  return missing;
}

/**
 * Check config file
 */
export function checkConfig(): DiagnosticCheck {
  try {
    const config = getConfig();
    const missingSections = findMissingConfigSections(config);

    if (missingSections.length > 0) {
      return {
        name: 'Configuration',
        status: 'warn',
        message: 'Missing sections: ' + missingSections.slice(0, 3).join(', ') + (missingSections.length > 3 ? ' (+' + (missingSections.length - 3) + ' more)' : ''),
        autoFixable: true,
        fixAction: 'Add missing sections (preserves user settings)',
      };
    }

    return {
      name: 'Configuration',
      status: 'pass',
      message: 'Loaded from config',
      autoFixable: false,
    };
  } catch {
    return {
      name: 'Configuration',
      status: 'warn',
      message: 'Invalid config file, will merge with defaults',
      autoFixable: true,
      fixAction: 'Save merged config (preserves valid settings)',
    };
  }
}

/**
 * Check for deprecated tool names in config (v2.0 migration)
 */
export function checkConfigMigration(): DiagnosticCheck {
  const deprecatedTools = ['matrix_warn_add', 'matrix_warn_remove', 'matrix_warn_check', 'matrix_warn_list'];

  try {
    const config = getConfig();
    const neverAutoApprove = config.hooks?.permissions?.neverAutoApprove ?? [];
    const found = neverAutoApprove.filter((t: string) => deprecatedTools.includes(t));

    if (found.length > 0) {
      return {
        name: 'Config Migration',
        status: 'warn',
        message: 'Deprecated tools in neverAutoApprove: ' + found.join(', ') + '. Use "matrix_warn" instead.',
        autoFixable: true,
        fixAction: 'Update deprecated tool names to v2.0 equivalents',
      };
    }

    return {
      name: 'Config Migration',
      status: 'pass',
      message: 'Config uses current tool names',
      autoFixable: false,
    };
  } catch {
    return {
      name: 'Config Migration',
      status: 'pass',
      message: 'Config migration check skipped (config not loaded)',
      autoFixable: false,
    };
  }
}

/**
 * Auto-fix core checks
 */
export async function fixCoreCheck(check: DiagnosticCheck): Promise<DiagnosticCheck> {
  try {
    switch (check.name) {
      case 'Matrix Directory':
        mkdirSync(MATRIX_DIR, { recursive: true });
        return { ...check, status: 'pass', fixed: true, message: 'Directory created' };

      case 'Database': {
        const migrationResult = runMigrations();
        if (migrationResult.success) {
          return {
            ...check,
            status: 'pass',
            fixed: true,
            message: migrationResult.migrationsRun > 0
              ? 'Migrated from v' + migrationResult.fromVersion + ' to v' + migrationResult.toVersion
              : 'Database created (v' + migrationResult.toVersion + ')',
          };
        }
        return {
          ...check,
          fixed: false,
          message: 'Migration failed: ' + migrationResult.error,
        };
      }

      case 'Configuration':
        clearCache();
        const mergedConfig = getConfig();
        saveConfig(mergedConfig);
        return { ...check, status: 'pass', fixed: true, message: 'Config updated (user settings preserved)' };

      case 'Config Migration': {
        const deprecatedTools = ['matrix_warn_add', 'matrix_warn_remove', 'matrix_warn_check', 'matrix_warn_list'];
        clearCache();
        const config = getConfig();
        const neverAutoApprove = config.hooks?.permissions?.neverAutoApprove ?? [];
        const hasDeprecated = neverAutoApprove.some((t: string) => deprecatedTools.includes(t));

        if (hasDeprecated && config.hooks?.permissions) {
          const updated = neverAutoApprove.filter((t: string) => !deprecatedTools.includes(t));
          if (!updated.includes('matrix_warn')) {
            updated.push('matrix_warn');
          }
          config.hooks.permissions.neverAutoApprove = updated;
          saveConfig(config);
          return { ...check, status: 'pass', fixed: true, message: 'Updated deprecated tool names to matrix_warn' };
        }
        return check;
      }

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
