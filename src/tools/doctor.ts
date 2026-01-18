/**
 * Matrix Doctor - Diagnostic and Auto-Fix Tool
 *
 * Checks Matrix plugin health and attempts to auto-fix issues.
 * If issue is not user-fixable, prompts user to open GitHub issue.
 *
 * Diagnostics covered:
 * - Matrix Directory
 * - Database (connection, schema, tables)
 * - Configuration (missing sections, auto-upgrade)
 * - Config Migration (deprecated tool names)
 * - Hooks Installation
 * - Code Index (with query verification)
 * - Index Tables (symbols, imports with repoPath support)
 * - Repo Detection
 * - Background Jobs System (v2.0+)
 * - Hook Executions Table (v2.0+)
 * - Skills Directory (v2.0+)
 * - Subagent Hooks Config (v2.0+)
 * - Model Delegation Config (v2.0+)
 * - Dreamer Scheduler (v2.1+)
 * - File Suggestion Script (v2.0+)
 */

import { existsSync, statSync, readdirSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { runMigrations } from '../db/migrate.js';
import { getDb } from '../db/index.js';
import { getSchemaVersion } from '../db/migrate.js';
import { getConfig, getConfigPath, saveConfig, clearCache, DEFAULT_CONFIG } from '../config/index.js';
import { fingerprintRepo } from '../repo/index.js';
import { matrixIndexStatus, matrixReindex } from './index-tools.js';

const MATRIX_DIR = join(homedir(), '.claude', 'matrix');
const CLAUDE_DIR = join(homedir(), '.claude');
const SKILLS_DIR = join(CLAUDE_DIR, 'skills');
const FILE_SUGGESTION_PATH = join(CLAUDE_DIR, 'file-suggestion.sh');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');
const GITHUB_REPO = 'https://github.com/ojowwalker77/Claude-Matrix';

// Embedded file-suggestion.sh content (same as session-start.ts)
const FILE_SUGGESTION_SCRIPT = `#!/bin/bash
# Custom file suggestion script for Claude Code (installed by Matrix)
# Uses rg + fzf for fuzzy matching and symlink support
# Prerequisites: brew install ripgrep jq fzf

QUERY=$(jq -r '.query // ""')
PROJECT_DIR="\${CLAUDE_PROJECT_DIR:-.}"
cd "$PROJECT_DIR" || exit 1
rg --files --follow --hidden . 2>/dev/null | sort -u | fzf --filter "$QUERY" | head -15
`;

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
 * Check config file for missing sections
 * Returns list of missing config paths that need to be added
 */
function findMissingConfigSections(config: ReturnType<typeof getConfig>): string[] {
  const missing: string[] = [];

  // Check for required config sections (added in v2.0+)
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

  return missing;
}

/**
 * Check config file
 */
function checkConfig(): DiagnosticCheck {
  const configPath = getConfigPath();

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
 * Check code index status and query functionality
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

    // Verify index queries work (tests repoPath functionality)
    const db = getDb();
    const queryTest = db.query(`
      SELECT COUNT(*) as count FROM symbols WHERE repo_id IS NOT NULL
    `).get() as { count: number } | null;

    if (!queryTest) {
      return {
        name: 'Code Index',
        status: 'warn',
        message: 'Index exists but queries fail',
        autoFixable: true,
        fixAction: 'Rebuild index',
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
 * Check for deprecated tool names in config (v2.0 migration)
 */
function checkConfigMigration(): DiagnosticCheck {
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
 * Check background_jobs table exists (v2.0+ feature)
 */
function checkBackgroundJobs(): DiagnosticCheck {
  try {
    const db = getDb();
    const tableExists = db.query(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='background_jobs'
    `).get();

    if (!tableExists) {
      return {
        name: 'Background Jobs',
        status: 'warn',
        message: 'background_jobs table missing (run migrations)',
        autoFixable: true,
        fixAction: 'Run database migrations',
      };
    }

    // Check for orphaned running jobs (jobs that were running when process died)
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
 * Check hook_executions table exists (v2.0+ feature for one-time hooks)
 */
function checkHookExecutions(): DiagnosticCheck {
  try {
    const db = getDb();
    const tableExists = db.query(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='hook_executions'
    `).get();

    if (!tableExists) {
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
 * Check index tables exist (symbols and imports for repoPath queries)
 */
function checkIndexTables(): DiagnosticCheck {
  try {
    const db = getDb();

    // Check symbols table
    const symbolsTable = db.query(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='symbols'
    `).get();

    // Check imports table
    const importsTable = db.query(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='imports'
    `).get();

    if (!symbolsTable || !importsTable) {
      const missing: string[] = [];
      if (!symbolsTable) missing.push('symbols');
      if (!importsTable) missing.push('imports');
      return {
        name: 'Index Tables',
        status: 'warn',
        message: 'Missing tables: ' + missing.join(', ') + ' (run migrations)',
        autoFixable: true,
        fixAction: 'Run database migrations',
      };
    }

    // Verify repo_id column exists for cross-repo queries
    const hasRepoId = db.query(`
      SELECT COUNT(*) as count FROM pragma_table_info('symbols')
      WHERE name = 'repo_id'
    `).get() as { count: number };

    if (hasRepoId.count === 0) {
      return {
        name: 'Index Tables',
        status: 'warn',
        message: 'symbols table missing repo_id column (repoPath queries unavailable)',
        autoFixable: true,
        fixAction: 'Run database migrations',
      };
    }

    return {
      name: 'Index Tables',
      status: 'pass',
      message: 'Tables exist with repoPath support',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Index Tables',
      status: 'warn',
      message: 'Check failed: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: true,
      fixAction: 'Run database migrations',
    };
  }
}

/**
 * Check skills directory exists (v2.0+ feature for hot-reloadable skills)
 */
function checkSkillsDirectory(): DiagnosticCheck {
  if (!existsSync(SKILLS_DIR)) {
    return {
      name: 'Skills Directory',
      status: 'warn',
      message: 'Skills directory not found: ' + SKILLS_DIR,
      autoFixable: true,
      fixAction: 'Create skills directory',
    };
  }

  try {
    const stat = statSync(SKILLS_DIR);
    if (!stat.isDirectory()) {
      return {
        name: 'Skills Directory',
        status: 'fail',
        message: SKILLS_DIR + ' exists but is not a directory',
        autoFixable: false,
      };
    }

    // Count skill files
    const files = readdirSync(SKILLS_DIR);
    const skillDirs = files.filter(f => {
      const skillPath = join(SKILLS_DIR, f);
      return statSync(skillPath).isDirectory() && existsSync(join(skillPath, 'SKILL.md'));
    });

    return {
      name: 'Skills Directory',
      status: 'pass',
      message: skillDirs.length + ' skills installed',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Skills Directory',
      status: 'warn',
      message: 'Cannot check skills: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: false,
    };
  }
}

/**
 * Check subagent hooks configuration (SubagentStart, SubagentStop)
 */
function checkSubagentHooks(): DiagnosticCheck {
  try {
    const config = getConfig();

    // Check if toolSearch config exists (used by subagent hooks)
    if (!config.toolSearch) {
      return {
        name: 'Subagent Hooks',
        status: 'warn',
        message: 'toolSearch config missing',
        autoFixable: true,
        fixAction: 'Add toolSearch config section',
      };
    }

    // Check if subagent preferences are configured
    const hasMatrixIndex = config.toolSearch.preferMatrixIndex !== undefined;
    const hasContext7 = config.toolSearch.preferContext7 !== undefined;

    if (!hasMatrixIndex || !hasContext7) {
      return {
        name: 'Subagent Hooks',
        status: 'warn',
        message: 'Subagent preferences not configured',
        autoFixable: true,
        fixAction: 'Add subagent hook preferences',
      };
    }

    return {
      name: 'Subagent Hooks',
      status: 'pass',
      message: 'Configured (matrixIndex: ' + config.toolSearch.preferMatrixIndex + ', context7: ' + config.toolSearch.preferContext7 + ')',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Subagent Hooks',
      status: 'warn',
      message: 'Check failed: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: true,
      fixAction: 'Repair configuration',
    };
  }
}

/**
 * Check model delegation configuration
 */
function checkDelegation(): DiagnosticCheck {
  try {
    const config = getConfig();

    if (!config.delegation) {
      return {
        name: 'Model Delegation',
        status: 'warn',
        message: 'delegation config section missing',
        autoFixable: true,
        fixAction: 'Add delegation config section',
      };
    }

    if (config.delegation.enabled === undefined) {
      return {
        name: 'Model Delegation',
        status: 'warn',
        message: 'delegation.enabled not set',
        autoFixable: true,
        fixAction: 'Add delegation.enabled setting',
      };
    }

    const model = config.delegation.model || 'haiku';
    return {
      name: 'Model Delegation',
      status: 'pass',
      message: config.delegation.enabled ? 'Enabled (' + model + ')' : 'Disabled',
      autoFixable: false,
    };
  } catch (err) {
    return {
      name: 'Model Delegation',
      status: 'warn',
      message: 'Check failed: ' + (err instanceof Error ? err.message : 'Unknown'),
      autoFixable: true,
      fixAction: 'Repair configuration',
    };
  }
}

/**
 * Check Dreamer scheduler tables and registration
 */
function checkDreamer(): DiagnosticCheck {
  try {
    const db = getDb();

    // Check dreamer_tasks table exists
    const tasksTable = db.query(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='dreamer_tasks'
    `).get();

    if (!tasksTable) {
      return {
        name: 'Dreamer Scheduler',
        status: 'warn',
        message: 'dreamer_tasks table missing (run migrations)',
        autoFixable: true,
        fixAction: 'Run database migrations',
      };
    }

    // Check dreamer_executions table exists
    const execsTable = db.query(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='dreamer_executions'
    `).get();

    if (!execsTable) {
      return {
        name: 'Dreamer Scheduler',
        status: 'warn',
        message: 'dreamer_executions table missing (run migrations)',
        autoFixable: true,
        fixAction: 'Run database migrations',
      };
    }

    // Count enabled tasks
    const taskCount = db.query(`
      SELECT COUNT(*) as count FROM dreamer_tasks WHERE enabled = 1
    `).get() as { count: number };

    // Check platform-specific scheduler health
    const platform = process.platform;
    let schedulerStatus = 'unknown';

    if (platform === 'darwin') {
      // Check launchd agents directory
      const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');
      if (existsSync(launchAgentsDir)) {
        const files = readdirSync(launchAgentsDir);
        const dreamerPlists = files.filter(f => f.startsWith('com.claude.dreamer.'));
        schedulerStatus = dreamerPlists.length + ' launchd agents';
      } else {
        schedulerStatus = 'LaunchAgents dir missing';
      }
    } else if (platform === 'linux') {
      // Check crontab
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
 * Check file-suggestion.sh installation
 */
function checkFileSuggestion(): DiagnosticCheck {
  // Check if script exists
  if (!existsSync(FILE_SUGGESTION_PATH)) {
    return {
      name: 'File Suggestion',
      status: 'warn',
      message: 'file-suggestion.sh not installed',
      autoFixable: true,
      fixAction: 'Install file-suggestion.sh',
    };
  }

  // Check if settings.json references it
  try {
    if (existsSync(SETTINGS_PATH)) {
      const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      if (!settings.fileSuggestion) {
        return {
          name: 'File Suggestion',
          status: 'warn',
          message: 'Script exists but not configured in settings.json',
          autoFixable: true,
          fixAction: 'Configure in settings.json',
        };
      }
    }
  } catch {
    // Ignore settings.json parse errors
  }

  // Check if prerequisites are available (rg, fzf, jq)
  const checkCommand = (cmd: string): boolean => {
    const result = spawnSync('which', [cmd], { encoding: 'utf-8' });
    return result.status === 0;
  };

  const hasRg = checkCommand('rg');
  const hasFzf = checkCommand('fzf');
  const hasJq = checkCommand('jq');

  if (!hasRg || !hasFzf || !hasJq) {
    const missing: string[] = [];
    if (!hasRg) missing.push('rg');
    if (!hasFzf) missing.push('fzf');
    if (!hasJq) missing.push('jq');
    return {
      name: 'File Suggestion',
      status: 'warn',
      message: 'Script installed but missing: ' + missing.join(', ') + ' (brew install ' + missing.join(' ') + ')',
      autoFixable: false,
    };
  }

  return {
    name: 'File Suggestion',
    status: 'pass',
    message: 'Installed and configured',
    autoFixable: false,
  };
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

      case 'Config Migration': {
        // Update deprecated tool names to v2.0 equivalents
        const deprecatedTools = ['matrix_warn_add', 'matrix_warn_remove', 'matrix_warn_check', 'matrix_warn_list'];
        clearCache();
        const config = getConfig();
        const neverAutoApprove = config.hooks?.permissions?.neverAutoApprove ?? [];
        const hasDeprecated = neverAutoApprove.some((t: string) => deprecatedTools.includes(t));

        if (hasDeprecated && config.hooks?.permissions) {
          // Remove deprecated, add unified tool if not present
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

      case 'Code Index':
        await matrixReindex({ full: true });
        return { ...check, status: 'pass', fixed: true, message: 'Index rebuilt' };

      case 'Background Jobs':
        if (check.message.includes('orphaned')) {
          // Clean up orphaned running jobs
          const db = getDb();
          db.query(`
            UPDATE background_jobs
            SET status = 'failed', error = 'Orphaned job cleaned up by doctor', completed_at = datetime('now')
            WHERE status = 'running' AND pid IS NOT NULL
          `).run();
          return { ...check, status: 'pass', fixed: true, message: 'Orphaned jobs cleaned up' };
        }
        // Table missing - migrations will fix
        runMigrations();
        return { ...check, status: 'pass', fixed: true, message: 'Table created via migrations' };

      case 'Hook Executions':
        // Table missing - migrations will fix
        runMigrations();
        return { ...check, status: 'pass', fixed: true, message: 'Table created via migrations' };

      case 'Index Tables':
        // Tables missing - migrations will fix
        runMigrations();
        return { ...check, status: 'pass', fixed: true, message: 'Tables created via migrations' };

      case 'Skills Directory':
        mkdirSync(SKILLS_DIR, { recursive: true });
        return { ...check, status: 'pass', fixed: true, message: 'Skills directory created' };

      case 'Subagent Hooks':
      case 'Model Delegation': {
        // Fix by merging config with defaults
        clearCache();
        const configToFix = getConfig();
        saveConfig(configToFix);
        return { ...check, status: 'pass', fixed: true, message: 'Config updated with defaults' };
      }

      case 'Dreamer Scheduler':
        // Table missing - migrations will fix
        runMigrations();
        return { ...check, status: 'pass', fixed: true, message: 'Tables created via migrations' };

      case 'File Suggestion': {
        // Install script if missing
        if (!existsSync(FILE_SUGGESTION_PATH)) {
          writeFileSync(FILE_SUGGESTION_PATH, FILE_SUGGESTION_SCRIPT, { mode: 0o755 });
        }
        // Update settings.json if needed
        let settings: Record<string, unknown> = {};
        if (existsSync(SETTINGS_PATH)) {
          try {
            settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
          } catch {
            settings = {};
          }
        }
        if (!('fileSuggestion' in settings)) {
          settings.fileSuggestion = {
            type: 'command',
            command: '~/.claude/file-suggestion.sh',
          };
          writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
        }
        return { ...check, status: 'pass', fixed: true, message: 'Script installed and configured' };
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

/**
 * Generate GitHub issue template for unfixable issues
 */
function generateIssueTemplate(result: DoctorResult): string {
  const failedChecks = result.checks.filter(c => c.status === 'fail' && !c.fixed);
  const warnChecks = result.checks.filter(c => c.status === 'warn' && !c.fixed);

  if (failedChecks.length === 0 && warnChecks.length === 0) {
    return '';
  }

  const failedSummary = failedChecks.length > 0
    ? failedChecks.map(c => '- **' + c.name + '**: ' + c.message).join('\n')
    : '_None_';

  const warnSummary = warnChecks.length > 0
    ? warnChecks.map(c => '- **' + c.name + '**: ' + c.message).join('\n')
    : '_None_';

  // Categorize checks for clearer reporting
  const categories = {
    core: ['Matrix Directory', 'Database', 'Configuration', 'Config Migration'],
    database: ['Background Jobs', 'Hook Executions', 'Dreamer Scheduler', 'Index Tables'],
    hooks: ['Hooks', 'Subagent Hooks'],
    config: ['Model Delegation'],
    features: ['Code Index', 'Skills Directory', 'File Suggestion', 'Repo Detection'],
  };

  const affectedCategories = new Set<string>();
  for (const check of [...failedChecks, ...warnChecks]) {
    for (const [cat, names] of Object.entries(categories)) {
      if (names.includes(check.name)) {
        affectedCategories.add(cat);
      }
    }
  }

  return `
## Bug Report

### Description
Matrix plugin diagnostic found issues that could not be auto-fixed.

### Failed Checks (Critical)
${failedSummary}

### Warning Checks (Non-Critical)
${warnSummary}

### Affected Categories
${Array.from(affectedCategories).map(c => '- ' + c).join('\n') || '_None identified_'}

### Environment
- **OS**: ${result.environment.os}
- **Bun Version**: ${result.environment.bunVersion}
- **Matrix Directory**: ${result.environment.matrixDir}
- **Config Path**: ${result.environment.configPath}
- **Database Path**: ${result.environment.dbPath}

### All Checks Summary
| Check | Status | Message |
|-------|--------|---------|
${result.checks.map(c => `| ${c.name} | ${c.status}${c.fixed ? ' (fixed)' : ''} | ${c.message.slice(0, 50)}${c.message.length > 50 ? '...' : ''} |`).join('\n')}

### Diagnostic Output
<details>
<summary>Full JSON Output</summary>

\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`

</details>

---
[Open issue on GitHub](${GITHUB_REPO}/issues/new?template=bug_report.md)
`;
}

/**
 * Run full diagnostics
 */
export async function matrixDoctor(input: DoctorInput = {}): Promise<DoctorResult> {
  const autoFix = input.autoFix ?? true;

  // Run all checks (grouped by category)
  let checks: DiagnosticCheck[] = [
    // Core infrastructure
    checkMatrixDir(),
    checkDatabase(),
    checkConfig(),
    checkConfigMigration(),

    // Database tables (v2.0+)
    checkBackgroundJobs(),
    checkHookExecutions(),
    checkIndexTables(),

    // Hooks system
    checkHooks(),
    checkSubagentHooks(),

    // Code index
    checkIndex(),

    // Repo detection
    checkRepoDetection(),

    // Config sections (v2.0+)
    checkDelegation(),

    // Skills system (v2.0+)
    checkSkillsDirectory(),

    // Scheduler system (v2.1+)
    checkDreamer(),

    // File suggestion (v2.0+)
    checkFileSuggestion(),
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
