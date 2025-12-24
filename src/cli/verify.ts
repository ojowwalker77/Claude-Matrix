/**
 * Matrix Installation Verification
 *
 * Comprehensive checks to ensure Matrix is properly installed:
 * - Core files exist
 * - Database initialized
 * - MCP registration valid with correct paths
 * - Hooks configured correctly
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { $ } from 'bun';
import { getMatrixPaths, getInstallationType, type MatrixPaths } from '../paths.js';
import {
  success, error, warn, info, dim, green, yellow, red, bold, cyan, muted,
  box, printBox
} from './utils/output.js';

export interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fix?: string;
}

export interface VerificationResult {
  passed: boolean;
  checks: CheckResult[];
  criticalFailures: string[];
  warnings: string[];
  paths: MatrixPaths;
  installationType: string;
}

/**
 * Run all verification checks
 */
export async function verifyInstallation(): Promise<VerificationResult> {
  const paths = getMatrixPaths();
  const installationType = getInstallationType();
  const checks: CheckResult[] = [];
  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  // Check 1: Core files exist
  const coreFileChecks = checkCoreFiles(paths);
  checks.push(...coreFileChecks);
  for (const check of coreFileChecks) {
    if (check.status === 'fail') criticalFailures.push(check.message);
  }

  // Check 2: Database
  const dbCheck = await checkDatabase(paths);
  checks.push(dbCheck);
  if (dbCheck.status === 'fail') criticalFailures.push(dbCheck.message);
  else if (dbCheck.status === 'warn') warnings.push(dbCheck.message);

  // Check 3: MCP Registration
  const mcpCheck = await checkMcpRegistration(paths);
  checks.push(mcpCheck);
  if (mcpCheck.status === 'fail') criticalFailures.push(mcpCheck.message);
  else if (mcpCheck.status === 'warn') warnings.push(mcpCheck.message);

  // Check 4: MCP Connection
  const connCheck = await checkMcpConnection();
  checks.push(connCheck);
  if (connCheck.status === 'fail') criticalFailures.push(connCheck.message);

  // Check 5: Hooks configuration
  const hookChecks = await checkHooksConfiguration(paths);
  checks.push(...hookChecks);
  for (const check of hookChecks) {
    if (check.status === 'fail') criticalFailures.push(check.message);
    else if (check.status === 'warn') warnings.push(check.message);
  }

  return {
    passed: criticalFailures.length === 0,
    checks,
    criticalFailures,
    warnings,
    paths,
    installationType,
  };
}

/**
 * Check that all core files exist
 */
function checkCoreFiles(paths: MatrixPaths): CheckResult[] {
  const results: CheckResult[] = [];

  const coreFiles = [
    { path: join(paths.src, 'index.ts'), name: 'MCP Server Entry' },
    { path: join(paths.src, 'cli.ts'), name: 'CLI Entry' },
    { path: join(paths.root, 'package.json'), name: 'package.json' },
  ];

  const hookFiles = [
    { path: join(paths.hooks, 'user-prompt-submit.ts'), name: 'UserPromptSubmit hook' },
    { path: join(paths.hooks, 'pre-tool-bash.ts'), name: 'PreToolBash hook' },
    { path: join(paths.hooks, 'pre-tool-edit.ts'), name: 'PreToolEdit hook' },
    { path: join(paths.hooks, 'post-tool-bash.ts'), name: 'PostToolBash hook' },
    { path: join(paths.hooks, 'stop-session.ts'), name: 'StopSession hook' },
  ];

  // Core files are critical
  for (const file of coreFiles) {
    if (existsSync(file.path)) {
      results.push({ name: file.name, status: 'pass', message: 'Found' });
    } else {
      results.push({
        name: file.name,
        status: 'fail',
        message: `Missing: ${file.path}`,
        fix: 'Reinstall Matrix: curl -fsSL https://raw.githubusercontent.com/ojowwalker77/Claude-Matrix/main/install.sh | bash'
      });
    }
  }

  // Hook files - warn if missing
  let allHooksExist = true;
  for (const file of hookFiles) {
    if (!existsSync(file.path)) {
      allHooksExist = false;
      break;
    }
  }

  if (allHooksExist) {
    results.push({ name: 'Hook Scripts', status: 'pass', message: 'All found' });
  } else {
    results.push({
      name: 'Hook Scripts',
      status: 'warn',
      message: 'Some hooks missing',
      fix: 'Run: matrix hooks install'
    });
  }

  return results;
}

/**
 * Check database is initialized and accessible
 */
async function checkDatabase(paths: MatrixPaths): Promise<CheckResult> {
  const dbPath = paths.db;

  if (!existsSync(dbPath)) {
    return {
      name: 'Database',
      status: 'warn',
      message: 'Not initialized',
      fix: 'Run: matrix init'
    };
  }

  try {
    // Try to import and use the db module
    const { Database } = await import('bun:sqlite');
    const db = new Database(dbPath, { readonly: true });

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    db.close();

    if (tables.length === 0) {
      return {
        name: 'Database',
        status: 'warn',
        message: 'Empty (no tables)',
        fix: 'Run: matrix init'
      };
    }

    const tableNames = tables.map(t => t.name);
    const requiredTables = ['solutions', 'failures'];
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));

    if (missingTables.length > 0) {
      return {
        name: 'Database',
        status: 'warn',
        message: `Missing tables: ${missingTables.join(', ')}`,
        fix: 'Run: matrix migrate'
      };
    }

    return { name: 'Database', status: 'pass', message: 'Initialized' };
  } catch (e) {
    return {
      name: 'Database',
      status: 'fail',
      message: `Error: ${e instanceof Error ? e.message : String(e)}`,
      fix: 'Delete matrix.db and run: matrix init'
    };
  }
}

/**
 * Check MCP registration is valid and points to existing files
 */
async function checkMcpRegistration(paths: MatrixPaths): Promise<CheckResult> {
  try {
    // Use claude mcp list to get the actual registered path
    const result = await $`claude mcp list`.quiet();
    const output = result.text();

    if (!output.includes('matrix')) {
      return {
        name: 'MCP Registration',
        status: 'fail',
        message: 'Matrix not registered',
        fix: `Run: claude mcp add matrix -s user -- bun run ${paths.src}/index.ts`
      };
    }

    // Parse the output to extract the registered path
    // Format: "matrix: bun run /path/to/index.ts - ✓ Connected"
    const match = output.match(/matrix:\s*bun run\s+(\S+\.ts)/);
    if (match) {
      const registeredPath = match[1];

      // Check if registered path exists
      if (!existsSync(registeredPath)) {
        return {
          name: 'MCP Registration',
          status: 'fail',
          message: `Registered path does not exist: ${registeredPath}`,
          fix: `Run: claude mcp remove matrix && claude mcp add matrix -s user -- bun run ${paths.src}/index.ts`
        };
      }

      // Check if registered path matches current installation
      const expectedPath = join(paths.src, 'index.ts');
      if (!registeredPath.includes(paths.root)) {
        return {
          name: 'MCP Registration',
          status: 'warn',
          message: `Path differs from current installation`,
          fix: 'Run: matrix init --force'
        };
      }

      return { name: 'MCP Registration', status: 'pass', message: 'Valid' };
    }

    // Couldn't parse the path, but matrix is registered
    return {
      name: 'MCP Registration',
      status: 'warn',
      message: 'Cannot determine registered path',
      fix: 'Run: matrix init --force'
    };
  } catch {
    // Fall back to checking mcp.json if claude CLI not available
    const mcpConfigPath = join(paths.claudeDir, 'mcp.json');

    if (!existsSync(mcpConfigPath)) {
      return {
        name: 'MCP Registration',
        status: 'warn',
        message: 'Claude CLI not available, mcp.json not found',
        fix: 'Run: matrix init'
      };
    }

    try {
      const config = JSON.parse(readFileSync(mcpConfigPath, 'utf-8'));
      const matrixConfig = config.mcpServers?.matrix;

      if (!matrixConfig) {
        return {
          name: 'MCP Registration',
          status: 'warn',
          message: 'Matrix not in mcp.json (Claude CLI unavailable)',
          fix: 'Install Claude Code and run: matrix init'
        };
      }

      return { name: 'MCP Registration', status: 'pass', message: 'Found in mcp.json' };
    } catch (e) {
      return {
        name: 'MCP Registration',
        status: 'fail',
        message: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
        fix: 'Check ~/.claude/mcp.json for JSON errors'
      };
    }
  }
}

/**
 * Check if MCP server can actually connect
 */
async function checkMcpConnection(): Promise<CheckResult> {
  try {
    const result = await $`claude mcp list`.quiet();
    const output = result.text();

    if (!output.includes('matrix')) {
      return {
        name: 'MCP Connection',
        status: 'warn',
        message: 'Matrix not in MCP list',
        fix: 'Run: matrix init'
      };
    }

    if (output.includes('matrix') && output.includes('Failed to connect')) {
      return {
        name: 'MCP Connection',
        status: 'fail',
        message: 'Cannot connect to MCP server',
        fix: 'Check registered path exists and bun is available'
      };
    }

    return { name: 'MCP Connection', status: 'pass', message: 'Connected' };
  } catch {
    return {
      name: 'MCP Connection',
      status: 'warn',
      message: 'Claude CLI not available',
      fix: 'Install Claude Code CLI to enable MCP'
    };
  }
}

/**
 * Check hooks configuration in settings.json
 */
async function checkHooksConfiguration(paths: MatrixPaths): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const settingsPath = join(paths.claudeDir, 'settings.json');

  if (!existsSync(settingsPath)) {
    results.push({
      name: 'Hooks Configuration',
      status: 'warn',
      message: 'settings.json not found (hooks not installed)',
      fix: 'Run: matrix hooks install'
    });
    return results;
  }

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const hooks = settings.hooks || {};

    // Find Matrix hooks and validate paths
    const hookEvents = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'];
    let anyMatrixHook = false;
    const missingPaths: string[] = [];
    let pathMismatch = false;

    for (const event of hookEvents) {
      const eventHooks = hooks[event] || [];
      for (const hookConfig of eventHooks) {
        for (const hook of hookConfig.hooks || []) {
          if (hook.command?.includes('matrix') || hook.command?.includes('hooks')) {
            anyMatrixHook = true;

            // Extract the hook path from command
            const match = hook.command.match(/bun run (.+\.ts)/);
            if (match) {
              const hookPath = match[1];
              if (!existsSync(hookPath)) {
                if (!missingPaths.includes(hookPath)) {
                  missingPaths.push(hookPath);
                }
              }
              // Check if path is from a different installation
              if (!hookPath.includes(paths.root)) {
                pathMismatch = true;
              }
            }
          }
        }
      }
    }

    if (!anyMatrixHook) {
      results.push({
        name: 'Hooks Registration',
        status: 'warn',
        message: 'No Matrix hooks found in settings',
        fix: 'Run: matrix hooks install'
      });
    } else if (missingPaths.length > 0) {
      results.push({
        name: 'Hooks Files',
        status: 'fail',
        message: `Hook files missing: ${missingPaths.length} path(s)`,
        fix: 'Run: matrix hooks uninstall && matrix hooks install'
      });
    } else if (pathMismatch) {
      results.push({
        name: 'Hooks Paths',
        status: 'warn',
        message: 'Hook paths may be from different installation',
        fix: 'Run: matrix hooks uninstall && matrix hooks install'
      });
    } else {
      results.push({
        name: 'Hooks Configuration',
        status: 'pass',
        message: 'Configured correctly'
      });
    }
  } catch (e) {
    results.push({
      name: 'Hooks Configuration',
      status: 'fail',
      message: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
      fix: 'Check ~/.claude/settings.json for JSON errors'
    });
  }

  return results;
}

/**
 * Print verification report
 */
export function printVerificationReport(result: VerificationResult): void {
  console.log();
  console.log(bold('Matrix Verification Report'));
  console.log();

  // Installation info
  console.log(`  ${cyan('Installation:')} ${result.installationType}`);
  console.log(`  ${cyan('Root:')} ${result.paths.root}`);
  console.log();

  // Check results
  console.log(bold('  Checks:'));
  console.log();

  for (const check of result.checks) {
    const icon = check.status === 'pass' ? green('✓') :
                 check.status === 'warn' ? yellow('!') : red('✗');
    const statusColor = check.status === 'pass' ? green :
                        check.status === 'warn' ? yellow : red;

    console.log(`    ${icon} ${check.name}: ${statusColor(check.message)}`);
    if (check.fix && check.status !== 'pass') {
      console.log(`      ${dim('→')} ${dim(check.fix)}`);
    }
  }

  console.log();

  // Summary
  if (result.passed) {
    success('All critical checks passed');
  } else {
    error(`${result.criticalFailures.length} critical issue(s) found`);
  }

  if (result.warnings.length > 0) {
    warn(`${result.warnings.length} warning(s)`);
  }

  console.log();
}

/**
 * CLI command entry point
 */
export async function verify(args: string[]): Promise<void> {
  const quiet = args.includes('--quiet') || args.includes('-q');
  const fix = args.includes('--fix');

  const result = await verifyInstallation();

  if (!quiet) {
    printVerificationReport(result);
  }

  if (fix && !result.passed) {
    console.log(bold('Attempting automatic fixes...'));
    console.log();
    // TODO: Implement auto-fix based on check failures
    warn('Auto-fix not yet implemented. Please run the suggested commands manually.');
    console.log();
  }

  process.exit(result.passed ? 0 : 1);
}
