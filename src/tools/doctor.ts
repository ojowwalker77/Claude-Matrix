/**
 * Matrix Doctor - Diagnostic and Auto-Fix Tool
 *
 * Checks Matrix plugin health and attempts to auto-fix issues.
 * If issue is not user-fixable, prompts user to open GitHub issue.
 */

import { existsSync, statSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { runMigrations } from '../db/migrate.js';
import { getDb } from '../db/index.js';
import { getSchemaVersion } from '../db/migrate.js';
import { getConfig, getConfigPath, saveConfig, clearCache } from '../config/index.js';
import { fingerprintRepo } from '../repo/index.js';
import { matrixIndexStatus, matrixReindex } from './index-tools.js';

const MATRIX_DIR = join(homedir(), '.claude', 'matrix');
const GITHUB_REPO = 'https://github.com/ojowwalker77/Claude-Matrix';

export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  autoFixable: boolean;
  fixed?: boolean;
  fixAction?: string;
}

export interface DoctorResult {
  healthy: boolean;
  checks: DiagnosticCheck[];
  environment: {
    os: string;
    bunVersion: string;
    matrixDir: string;
    configPath: string;
    dbPath: string;
  };
  suggestions: string[];
  issueTemplate?: string;
}

export interface DoctorInput {
  autoFix?: boolean;
}

/**
 * Check if Matrix directory exists and is writable
 */
function checkMatrixDir(): DiagnosticCheck {
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
function checkDatabase(): DiagnosticCheck {
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

    // Quick health check
    const result = db.query('SELECT COUNT(*) as count FROM solutions').get() as { count: number };

    return {
      name: 'Database',
      status: 'pass',
      message: 'Connected, schema v' + version.current + ', ' + result.count + ' solutions',
      autoFixable: false,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';

    // Check if DB file exists - if yes, it's corrupted (DON'T auto-fix to prevent data loss)
    if (existsSync(dbPath)) {
      return {
        name: 'Database',
        status: 'fail',
        message: 'Database corrupted: ' + errorMsg + '. Backup: ' + dbPath,
        autoFixable: false, // NEVER auto-fix corrupted DB - user must decide
      };
    }

    // DB file doesn't exist - safe to create new one
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
 * Check config file
 */
function checkConfig(): DiagnosticCheck {
  const configPath = getConfigPath();

  try {
    const config = getConfig();

    if (!config.hooks) {
      return {
        name: 'Configuration',
        status: 'warn',
        message: 'Config missing hooks section',
        autoFixable: true,
        fixAction: 'Add missing sections (preserves user settings)',
      };
    }

    return {
      name: 'Configuration',
      status: 'pass',
      message: 'Loaded from ' + configPath,
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
 * Check hooks installation
 */
function checkHooks(): DiagnosticCheck {
  const hooksDir = join(MATRIX_DIR, '..', 'plugins', 'marketplaces', 'matrix-marketplace', 'hooks');

  if (!existsSync(hooksDir)) {
    return {
      name: 'Hooks',
      status: 'warn',
      message: 'Hooks directory not found (may be in different location)',
      autoFixable: false,
    };
  }

  try {
    const files = readdirSync(hooksDir);
    const hasHooksJson = files.includes('hooks.json');

    if (!hasHooksJson) {
      return {
        name: 'Hooks',
        status: 'warn',
        message: 'hooks.json not found',
        autoFixable: false,
      };
    }

    return {
      name: 'Hooks',
      status: 'pass',
      message: 'Installed at ' + hooksDir,
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Hooks',
      status: 'warn',
      message: 'Cannot check hooks: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: false,
    };
  }
}

/**
 * Check code index status
 */
function checkIndex(): DiagnosticCheck {
  try {
    const status = matrixIndexStatus();

    if (!status.indexed) {
      return {
        name: 'Code Index',
        status: 'warn',
        message: 'Repository not indexed',
        autoFixable: true,
        fixAction: 'Index repository',
      };
    }

    return {
      name: 'Code Index',
      status: 'pass',
      message: (status.status?.symbolCount ?? 0) + ' symbols in ' + (status.status?.filesIndexed ?? 0) + ' files',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Code Index',
      status: 'warn',
      message: 'Index check failed: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: true,
      fixAction: 'Rebuild index',
    };
  }
}

/**
 * Check repo fingerprinting
 */
function checkRepoDetection(): DiagnosticCheck {
  try {
    const detected = fingerprintRepo();

    if (!detected.name || detected.name === 'unknown') {
      return {
        name: 'Repo Detection',
        status: 'warn',
        message: 'Could not detect repository',
        autoFixable: false,
      };
    }

    return {
      name: 'Repo Detection',
      status: 'pass',
      message: detected.name + ' (' + detected.languages.join(', ') + ')',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Repo Detection',
      status: 'warn',
      message: 'Detection failed: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: false,
    };
  }
}

/**
 * Attempt to auto-fix an issue
 */
async function attemptFix(check: DiagnosticCheck): Promise<DiagnosticCheck> {
  if (!check.autoFixable || check.status === 'pass') {
    return check;
  }

  try {
    switch (check.name) {
      case 'Matrix Directory':
        mkdirSync(MATRIX_DIR, { recursive: true });
        return { ...check, status: 'pass', fixed: true, message: 'Directory created' };

      case 'Database':
        // Run migrations - NEVER deletes data, only adds tables/columns
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

      case 'Configuration':
        // NEVER overwrite user config - merge with defaults to add missing sections
        clearCache(); // Clear cached config
        const mergedConfig = getConfig(); // Returns user config merged with defaults
        saveConfig(mergedConfig); // Save merged config (preserves user settings)
        return { ...check, status: 'pass', fixed: true, message: 'Config updated (user settings preserved)' };

      case 'Code Index':
        await matrixReindex({ full: true });
        return { ...check, status: 'pass', fixed: true, message: 'Index rebuilt' };

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

/**
 * Generate GitHub issue template for unfixable issues
 */
function generateIssueTemplate(result: DoctorResult): string {
  const failedChecks = result.checks.filter(c => c.status === 'fail' && !c.fixed);

  if (failedChecks.length === 0) {
    return '';
  }

  const checksSummary = failedChecks
    .map(c => '- **' + c.name + '**: ' + c.message)
    .join('\n');

  return `
## Bug Report

### Description
Matrix plugin diagnostic found issues that could not be auto-fixed.

### Failed Checks
${checksSummary}

### Environment
- **OS**: ${result.environment.os}
- **Bun Version**: ${result.environment.bunVersion}
- **Matrix Directory**: ${result.environment.matrixDir}
- **Config Path**: ${result.environment.configPath}
- **Database Path**: ${result.environment.dbPath}

### Diagnostic Output
\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`

---
[Open issue on GitHub](${GITHUB_REPO}/issues/new?template=bug_report.md)
`;
}

/**
 * Run full diagnostics
 */
export async function matrixDoctor(input: DoctorInput = {}): Promise<DoctorResult> {
  const autoFix = input.autoFix ?? true;

  // Run all checks
  let checks: DiagnosticCheck[] = [
    checkMatrixDir(),
    checkDatabase(),
    checkConfig(),
    checkHooks(),
    checkIndex(),
    checkRepoDetection(),
  ];

  // Attempt auto-fixes if enabled
  if (autoFix) {
    checks = await Promise.all(checks.map(attemptFix));
  }

  // Determine overall health
  const hasFailures = checks.some(c => c.status === 'fail' && !c.fixed);

  // Generate suggestions
  const suggestions: string[] = [];

  for (const check of checks) {
    if (check.status === 'fail' && !check.fixed) {
      if (check.autoFixable) {
        suggestions.push('Run /matrix:doctor with autoFix to fix: ' + check.name);
      } else if (check.name === 'Database' && check.message.includes('corrupted')) {
        // Special guidance for corrupted DB - NEVER lose user data
        suggestions.push('Database corrupted - data preserved at ~/.claude/matrix/matrix.db');
        suggestions.push('Recovery options: (1) Try sqlite3 ~/.claude/matrix/matrix.db ".dump" > backup.sql');
        suggestions.push('Or rename matrix.db to matrix.db.bak and run doctor again to create fresh DB');
      } else {
        suggestions.push('Manual intervention needed for: ' + check.name);
      }
    }
  }

  if (hasFailures) {
    suggestions.push('If issues persist, open a bug report: ' + GITHUB_REPO + '/issues/new?template=bug_report.md');
  }

  const result: DoctorResult = {
    healthy: !hasFailures,
    checks,
    environment: {
      os: process.platform + ' ' + process.arch,
      bunVersion: Bun.version,
      matrixDir: MATRIX_DIR,
      configPath: getConfigPath(),
      dbPath: join(MATRIX_DIR, 'matrix.db'),
    },
    suggestions,
  };

  // Generate issue template for unfixable issues
  if (hasFailures) {
    result.issueTemplate = generateIssueTemplate(result);
  }

  return result;
}
