/**
 * Unified path resolution for Matrix
 *
 * Handles all installation methods:
 * - Homebrew: /opt/homebrew/Cellar/matrix/X.X.X/libexec/
 * - Git clone: ~/.claude/matrix/
 * - Nested git: ~/.claude/matrix/Claude-Matrix/
 * - Custom: $MATRIX_DIR env var
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export interface MatrixPaths {
  root: string;           // Base Matrix directory (where package.json lives)
  src: string;            // Source files directory
  hooks: string;          // Hook scripts directory
  db: string;             // Database file path
  config: string;         // Config file path
  templates: string;      // Template files directory
  bin: string;            // Binary/CLI directory
  claudeDir: string;      // ~/.claude directory
}

/**
 * Validates if a directory is a valid Matrix installation
 */
function isValidMatrixDir(dir: string): boolean {
  if (!existsSync(dir)) return false;

  // Must have package.json and src/index.ts
  const hasPackageJson = existsSync(join(dir, 'package.json'));
  const hasIndexTs = existsSync(join(dir, 'src', 'index.ts'));

  return hasPackageJson && hasIndexTs;
}

/**
 * Builds paths object from a root directory
 */
function buildPaths(root: string, claudeDir: string): MatrixPaths {
  return {
    root,
    src: join(root, 'src'),
    hooks: join(root, 'src', 'hooks'),
    db: join(claudeDir, 'matrix', 'matrix.db'),  // DB always in ~/.claude/matrix/
    config: join(claudeDir, 'matrix.config'),
    templates: join(root, 'templates'),
    bin: join(root, 'bin'),
    claudeDir,
  };
}

/**
 * Resolves Matrix paths with priority order:
 * 1. $MATRIX_DIR env var (explicit override)
 * 2. Detect from current script location (Homebrew installs)
 * 3. ~/.claude/matrix/Claude-Matrix (nested git clone - common issue)
 * 4. ~/.claude/matrix (standard git clone)
 */
export function resolveMatrixPaths(): MatrixPaths {
  const home = process.env['HOME'] || homedir();
  const claudeDir = join(home, '.claude');
  const candidates: string[] = [];

  // 1. Environment variable takes priority
  if (process.env['MATRIX_DIR']) {
    candidates.push(process.env['MATRIX_DIR']);
  }

  // 2. Detect from current script location (for Homebrew)
  // When running via Homebrew, we're in libexec/src/something
  const scriptPath = process.argv[1] || __filename;
  const scriptDir = dirname(scriptPath);

  // Check if we're running from a Homebrew-style installation
  // e.g., /opt/homebrew/Cellar/matrix/0.5.1/libexec/src/cli.ts
  if (scriptDir.includes('libexec')) {
    // Go up to libexec root
    let libexec = scriptDir;
    while (libexec && !libexec.endsWith('libexec')) {
      const parent = dirname(libexec);
      if (parent === libexec) break;
      libexec = parent;
    }
    if (libexec.endsWith('libexec')) {
      candidates.push(libexec);
    }
  }

  // 3. Nested git clone (common issue when users clone to existing dir)
  candidates.push(join(home, '.claude', 'matrix', 'Claude-Matrix'));

  // 4. Standard git clone location
  candidates.push(join(home, '.claude', 'matrix'));

  // Find first valid installation
  for (const candidate of candidates) {
    if (isValidMatrixDir(candidate)) {
      return buildPaths(candidate, claudeDir);
    }
  }

  // No valid installation found - return default paths for new installation
  const defaultRoot = join(home, '.claude', 'matrix');
  return buildPaths(defaultRoot, claudeDir);
}

// Singleton cache for paths
let cachedPaths: MatrixPaths | null = null;

/**
 * Get Matrix paths (cached for performance)
 */
export function getMatrixPaths(): MatrixPaths {
  if (!cachedPaths) {
    cachedPaths = resolveMatrixPaths();
  }
  return cachedPaths;
}

/**
 * Clear the path cache (useful for testing or after installation)
 */
export function resetPathCache(): void {
  cachedPaths = null;
}

/**
 * Check if Matrix is installed and valid
 */
export function isMatrixInstalled(): boolean {
  const paths = getMatrixPaths();
  return isValidMatrixDir(paths.root);
}

/**
 * Get a description of where Matrix was found
 */
export function getInstallationType(): 'homebrew' | 'git' | 'nested-git' | 'custom' | 'not-found' {
  const paths = getMatrixPaths();

  if (!isValidMatrixDir(paths.root)) {
    return 'not-found';
  }

  if (process.env['MATRIX_DIR']) {
    return 'custom';
  }

  if (paths.root.includes('libexec') || paths.root.includes('Cellar')) {
    return 'homebrew';
  }

  if (paths.root.endsWith('Claude-Matrix')) {
    return 'nested-git';
  }

  return 'git';
}
