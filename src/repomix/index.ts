/**
 * Repomix Integration
 *
 * Wrapper for repomix library with caching support.
 * Packs repositories into AI-friendly single-file context.
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import {
  runRemoteAction,
  runDefaultAction,
  isValidShorthand,
  isValidRemoteValue,
  type CliOptions
} from 'repomix';

const MATRIX_DIR = join(homedir(), '.claude', 'matrix');
const DB_PATH = join(MATRIX_DIR, 'matrix.db');
const CACHE_TTL_HOURS = 1;

export interface RepomixOptions {
  target: string;           // GitHub shorthand (user/repo) or local path
  branch?: string;          // Branch or commit
  style?: 'xml' | 'markdown' | 'plain';
  include?: string;         // Glob patterns (comma-separated)
  compress?: boolean;       // Compress to function signatures only
  maxTokens?: number;       // Maximum tokens to return (default 50000)
}

export interface RepomixResult {
  success: boolean;
  target: string;
  stats: {
    fileCount: number;
    totalTokens: number;
    totalCharacters: number;
    truncated: boolean;
  };
  content: string;
  cachedAt?: string;
  error?: string;
}

/**
 * Generate cache key from options
 */
function getCacheKey(options: RepomixOptions): string {
  const normalized = {
    target: options.target,
    branch: options.branch || 'default',
    style: options.style || 'markdown',
    include: options.include || '*',
    compress: options.compress || false,
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
}

/**
 * Check cache for existing result
 */
function checkCache(db: Database, cacheKey: string): RepomixResult | null {
  try {
    const row = db.query<{ content: string; stats: string; created_at: string }, [string]>(`
      SELECT content, stats, created_at
      FROM repomix_cache
      WHERE id = ? AND expires_at > datetime('now')
    `).get(cacheKey);

    if (row) {
      const stats = JSON.parse(row.stats);
      return {
        success: true,
        target: stats.target || '',
        stats: {
          fileCount: stats.fileCount || 0,
          totalTokens: stats.totalTokens || 0,
          totalCharacters: stats.totalCharacters || 0,
          truncated: stats.truncated || false,
        },
        content: row.content,
        cachedAt: row.created_at,
      };
    }
  } catch {
    // Cache miss or error
  }
  return null;
}

/**
 * Store result in cache
 */
function storeCache(db: Database, cacheKey: string, target: string, stats: RepomixResult['stats'], content: string): void {
  try {
    db.run(`
      INSERT OR REPLACE INTO repomix_cache (id, target, options, content, stats, created_at, expires_at)
      VALUES (?, ?, '{}', ?, ?, datetime('now'), datetime('now', '+${CACHE_TTL_HOURS} hour'))
    `, [cacheKey, target, content, JSON.stringify({ ...stats, target })]);
  } catch (err) {
    console.error('[Matrix:Repomix] Cache store error:', err);
  }
}

/**
 * Clean expired cache entries
 */
function cleanExpiredCache(db: Database): void {
  try {
    db.run(`DELETE FROM repomix_cache WHERE expires_at < datetime('now')`);
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Truncate content to max tokens (approximate)
 */
function truncateToTokens(content: string, maxTokens: number): { content: string; truncated: boolean } {
  // Approximate: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) {
    return { content, truncated: false };
  }

  // Find a good break point (end of a file section)
  let breakPoint = content.lastIndexOf('\n---', maxChars);
  if (breakPoint < maxChars * 0.8) {
    breakPoint = content.lastIndexOf('\n\n', maxChars);
  }
  if (breakPoint < maxChars * 0.8) {
    breakPoint = maxChars;
  }

  const truncated = content.slice(0, breakPoint);
  const remaining = content.length - breakPoint;
  const footer = `\n\n[TRUNCATED: ${Math.round(remaining / 1000)}k characters remaining. Use --include to filter specific files.]`;

  return { content: truncated + footer, truncated: true };
}

/**
 * Pack a repository using repomix
 */
export async function packRepository(options: RepomixOptions): Promise<RepomixResult> {
  const { target, branch, style = 'markdown', include, compress = false, maxTokens = 50000 } = options;

  // Open database
  let db: Database;
  try {
    db = new Database(DB_PATH);
  } catch (err) {
    return {
      success: false,
      target,
      stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0, truncated: false },
      content: '',
      error: `Database error: ${err}`,
    };
  }

  try {
    // Clean expired cache entries periodically
    cleanExpiredCache(db);

    // Check cache
    const cacheKey = getCacheKey(options);
    const cached = checkCache(db, cacheKey);
    if (cached) {
      return cached;
    }

    // Determine if target is remote or local
    const isRemote = isValidShorthand(target) || isValidRemoteValue(target);

    // Build CLI options
    const cliOptions: CliOptions = {
      style,
      compress,
      stdout: true,           // Output to stdout (we'll capture it)
      copy: false,            // Don't copy to clipboard
      removeComments: compress,
      removeEmptyLines: compress,
      securityCheck: true,
      quiet: true,
    };

    if (include) {
      cliOptions.include = include;
    }
    if (branch) {
      cliOptions.remoteBranch = branch;
    }

    // Create temp output file
    const tempDir = join(MATRIX_DIR, 'temp');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    const tempOutput = join(tempDir, `repomix-${cacheKey}.txt`);
    cliOptions.output = tempOutput;
    cliOptions.stdout = false;

    let result: { packResult?: { totalFiles: number; totalTokens: number; totalCharacters: number } };

    if (isRemote) {
      // Remote repository
      result = await runRemoteAction(target, cliOptions);
    } else {
      // Local path
      const cwd = process.cwd();
      const localPath = target.startsWith('/') ? target : join(cwd, target);
      if (!existsSync(localPath)) {
        return {
          success: false,
          target,
          stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0, truncated: false },
          content: '',
          error: `Path not found: ${localPath}`,
        };
      }
      result = await runDefaultAction([localPath], cwd, cliOptions);
    }

    // Read output
    let content = '';
    if (existsSync(tempOutput)) {
      content = readFileSync(tempOutput, 'utf-8');
      rmSync(tempOutput, { force: true });
    }

    if (!content) {
      return {
        success: false,
        target,
        stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0, truncated: false },
        content: '',
        error: 'No output generated',
      };
    }

    // Truncate if needed
    const { content: finalContent, truncated } = truncateToTokens(content, maxTokens);

    const stats: RepomixResult['stats'] = {
      fileCount: result.packResult?.totalFiles || 0,
      totalTokens: result.packResult?.totalTokens || Math.round(content.length / 4),
      totalCharacters: result.packResult?.totalCharacters || content.length,
      truncated,
    };

    // Store in cache
    storeCache(db, cacheKey, target, stats, finalContent);

    return {
      success: true,
      target,
      stats,
      content: finalContent,
    };

  } catch (err) {
    return {
      success: false,
      target,
      stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0, truncated: false },
      content: '',
      error: `Pack failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    db.close();
  }
}

/**
 * Format result for display
 */
export function formatResult(result: RepomixResult): string {
  if (!result.success) {
    return `Error packing ${result.target}: ${result.error}`;
  }

  const header = [
    `# Repository: ${result.target}`,
    `Files: ${result.stats.fileCount} | Tokens: ~${Math.round(result.stats.totalTokens / 1000)}k | Chars: ${Math.round(result.stats.totalCharacters / 1000)}k`,
  ];

  if (result.cachedAt) {
    header.push(`(cached at ${result.cachedAt})`);
  }
  if (result.stats.truncated) {
    header.push('⚠️ Output truncated to fit token limit');
  }

  return `${header.join('\n')}\n\n${result.content}`;
}
