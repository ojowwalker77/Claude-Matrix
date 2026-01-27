/**
 * Matrix Doctor - Diagnostic and Auto-Fix Tool
 *
 * Checks Matrix plugin health and attempts to auto-fix issues.
 * If issue is not user-fixable, prompts user to open GitHub issue.
 */

import { join } from 'path';
import { homedir } from 'os';
import { getConfigPath } from '../../config/index.js';
import type { DiagnosticCheck, DoctorResult, DoctorInput } from './types.js';

// Import checks
import { checkMatrixDir, checkDatabase, checkConfig, checkConfigMigration, fixCoreCheck, MATRIX_DIR } from './checks/core.js';
import { checkBackgroundJobs, checkHookExecutions, checkDreamer, fixTableCheck } from './checks/tables.js';
import { checkHooks, checkSubagentHooks, checkDelegation, fixHooksCheck } from './checks/hooks.js';
import { checkIndex, checkRepoDetection, checkSkillsDirectory, checkFileSuggestion, fixFeatureCheck } from './checks/features.js';
import { generateIssueTemplate, GITHUB_REPO } from './issue-template.js';

// Re-export types
export type { DiagnosticCheck, DoctorResult, DoctorInput } from './types.js';

/**
 * Attempt to auto-fix an issue
 */
async function attemptFix(check: DiagnosticCheck): Promise<DiagnosticCheck> {
  if (!check.autoFixable || check.status === 'pass') {
    return check;
  }

  // Route to appropriate fixer based on check category
  const coreChecks = ['Matrix Directory', 'Database', 'Configuration', 'Config Migration'];
  const tableChecks = ['Background Jobs', 'Hook Executions', 'Dreamer Scheduler'];
  const hookChecks = ['Subagent Hooks', 'Model Delegation'];
  const featureChecks = ['Code Index', 'Skills Directory', 'File Suggestion'];

  if (coreChecks.includes(check.name)) {
    return fixCoreCheck(check);
  }
  if (tableChecks.includes(check.name)) {
    return fixTableCheck(check);
  }
  if (hookChecks.includes(check.name)) {
    return fixHooksCheck(check);
  }
  if (featureChecks.includes(check.name)) {
    return fixFeatureCheck(check);
  }

  return check;
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
