/**
 * File Scanner
 *
 * Discovers source code files in a repository across multiple languages.
 * Uses Bun.Glob for fast file discovery with pattern exclusions.
 */

import { join } from 'path';
import { stat } from 'fs/promises';
import type { ScannedFile } from './types.js';
import { getSupportedExtensions } from './languages/index.js';

// File extensions to index - dynamically loaded from language registry
const EXTENSIONS = getSupportedExtensions();

// Default directories to exclude
const DEFAULT_EXCLUDES = [
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage',
  '.next',
  '.nuxt',
  '.output',
  '.cache',
  '__pycache__',
  'vendor',
  '.turbo',
  '.vercel',
  // Language-specific build directories
  'target',          // Rust
  'bin',             // Go binaries
  'pkg',             // Go packages
  '.bundle',         // Ruby
  'venv',            // Python virtual env
  '.venv',
  'env',
  '.tox',            // Python tox
  '.mypy_cache',     // Python mypy
  '.pytest_cache',   // Python pytest
  'Pods',            // iOS/CocoaPods
  'obj',             // .NET
  'out',             // Various build outputs
];

export interface ScanOptions {
  repoRoot: string;
  excludePatterns?: string[];
  maxFileSize?: number;       // bytes, default: 1MB
  includeTests?: boolean;     // include test files, default: false
}

/**
 * Scan a repository for source code files across all supported languages
 */
export async function scanRepository(options: ScanOptions): Promise<ScannedFile[]> {
  const {
    repoRoot,
    excludePatterns = [],
    maxFileSize = 1024 * 1024, // 1MB
    includeTests = false,
  } = options;

  const files: ScannedFile[] = [];

  // Build glob pattern for all supported extensions
  const pattern = `**/*.{${EXTENSIONS.join(',')}}`;

  // Build exclusion list
  const allExcludes = [
    ...DEFAULT_EXCLUDES.map(dir => `**/${dir}/**`),
    ...excludePatterns,
  ];

  // Add test file exclusions unless includeTests is true
  if (!includeTests) {
    allExcludes.push(
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.test.js',
      '**/*.test.jsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*.spec.js',
      '**/*.spec.jsx',
      '**/__tests__/**',
      '**/__mocks__/**',
    );
  }

  // Always exclude declaration files
  allExcludes.push('**/*.d.ts', '**/*.d.mts', '**/*.d.cts');

  // Pre-compile exclude patterns (avoid regex compilation per file)
  const compiledExcludes = allExcludes.map(excludePattern => {
    if (excludePattern.includes('*')) {
      const regex = excludePattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '___DOUBLESTAR___')
        .replace(/\*/g, '[^/]*')
        .replace(/___DOUBLESTAR___/g, '.*');
      return { type: 'regex' as const, regex: new RegExp(`^${regex}$`) };
    }
    return { type: 'substring' as const, pattern: excludePattern };
  });

  const glob = new Bun.Glob(pattern);

  for await (const filePath of glob.scan({
    cwd: repoRoot,
    absolute: false,
    onlyFiles: true,
  })) {
    // Quick check for common exclusions (performance optimization)
    const pathParts = filePath.split('/');
    const shouldExcludeQuick = DEFAULT_EXCLUDES.some(dir => pathParts.includes(dir));
    if (shouldExcludeQuick) {
      continue;
    }

    // Check pre-compiled exclusion patterns
    const shouldExclude = compiledExcludes.some(compiled => {
      if (compiled.type === 'regex') {
        return compiled.regex.test(filePath);
      }
      return filePath.includes(compiled.pattern);
    });

    if (shouldExclude) {
      continue;
    }

    const absolutePath = join(repoRoot, filePath);

    try {
      const stats = await stat(absolutePath);

      // Skip files larger than maxFileSize
      if (stats.size > maxFileSize) {
        continue;
      }

      files.push({
        path: filePath,
        absolutePath,
        mtime: Math.floor(stats.mtimeMs),
      });
    } catch {
      // File doesn't exist or can't be read, skip
      continue;
    }
  }

  return files;
}

/**
 * Get file stats for a single file
 */
export async function getFileStats(absolutePath: string): Promise<{ mtime: number; size: number } | null> {
  try {
    const stats = await stat(absolutePath);
    return {
      mtime: Math.floor(stats.mtimeMs),
      size: stats.size,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a path matches any exclusion pattern
 */
export function isExcluded(filePath: string, excludePatterns: string[] = []): boolean {
  // Quick check: path contains excluded directory as a path segment
  const pathParts = filePath.split('/');
  if (DEFAULT_EXCLUDES.some(dir => pathParts.includes(dir))) {
    return true;
  }

  // Check declaration files (.d.ts, .d.mts, .d.cts)
  if (/\.d\.(ts|mts|cts)$/.test(filePath)) {
    return true;
  }

  // Check test files
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath)) {
    return true;
  }

  // Check minified/bundle files
  if (/\.(min|bundle)\.(js|ts)$/.test(filePath)) {
    return true;
  }

  // Check custom exclusion patterns
  for (const pattern of excludePatterns) {
    if (pattern.includes('*')) {
      // Convert glob to regex
      const regex = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*');
      if (new RegExp(regex).test(filePath)) {
        return true;
      }
    } else if (filePath.includes(pattern)) {
      return true;
    }
  }

  return false;
}
