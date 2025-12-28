/**
 * Repomix Integration v2 - Query-First, Progressive, Semantic Search
 *
 * Intelligent repository packing that minimizes token consumption:
 * 1. Fetch file tree only (no content)
 * 2. Semantic search to find relevant files
 * 3. Ask user for confirmation before packing
 * 4. Pack only confirmed files
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, rmSync, readFileSync, readdirSync, statSync } from 'fs';
import { createHash } from 'crypto';
import {
  runRemoteAction,
  runDefaultAction,
  isValidShorthand,
  isValidRemoteValue,
  type CliOptions
} from 'repomix';
import { getEmbedding, getEmbeddings, cosineSimilarity } from '../embeddings/index.js';

const MATRIX_DIR = join(homedir(), '.claude', 'matrix');
const DB_PATH = join(MATRIX_DIR, 'matrix.db');
const DEFAULT_CACHE_TTL_HOURS = 24;

// ============================================================================
// Types
// ============================================================================

export interface FileInfo {
  path: string;
  size: number;
  estimatedTokens: number;
}

export interface RepomixOptions {
  target: string;           // GitHub shorthand (user/repo) or local path
  query: string;            // REQUIRED - what the user is looking for
  branch?: string;          // Branch or commit
  confirmedFiles?: string[]; // Files confirmed by user (phase 2)
  maxTokens?: number;       // Maximum tokens to return (default 30000)
  maxFiles?: number;        // Maximum files to suggest (default 15)
  cacheTTLHours?: number;   // Cache duration (default 24)
}

export interface IndexResult {
  phase: 'index';
  target: string;
  query: string;
  branch?: string;
  totalFiles: number;
  totalEstimatedTokens: number;
  suggestedFiles: FileInfo[];
  suggestedTokens: number;
  message: string;
}

export interface PackResult {
  phase: 'pack';
  success: boolean;
  target: string;
  query: string;
  stats: {
    fileCount: number;
    totalTokens: number;
    totalCharacters: number;
  };
  content: string;
  cachedAt?: string;
  error?: string;
}

export type RepomixResult = IndexResult | PackResult;

// ============================================================================
// Smart Exclusion Patterns
// ============================================================================

const EXCLUDED_PATTERNS = [
  // Test files
  /\/__tests__\//,
  /\/test\//,
  /\/tests\//,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,

  // Documentation and examples
  /\/docs\//,
  /\/examples?\//,
  /\/fixtures?\//,
  /\/samples?\//,

  // Build outputs
  /\/dist\//,
  /\/build\//,
  /\/out\//,
  /\/.next\//,

  // Dependencies
  /\/node_modules\//,
  /\/vendor\//,

  // Config files (usually not implementation)
  /\.json$/,
  /\.yaml$/,
  /\.yml$/,
  /\.toml$/,
  /\.md$/,
  /\.txt$/,
  /\.lock$/,

  // IDE and tooling
  /\/\.vscode\//,
  /\/\.idea\//,
  /\/\.github\//,
];

function shouldExcludeFile(path: string): boolean {
  return EXCLUDED_PATTERNS.some(pattern => pattern.test(path));
}

// ============================================================================
// Cache Functions
// ============================================================================

function getCacheKey(target: string, query: string, files?: string[]): string {
  const normalized = {
    target,
    query: query.toLowerCase().trim(),
    files: files?.sort() || [],
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
}

function checkPackCache(db: Database, cacheKey: string): PackResult | null {
  try {
    const row = db.query<{ content: string; stats: string; created_at: string; query: string }, [string]>(`
      SELECT content, stats, created_at, options as query
      FROM repomix_cache
      WHERE id = ? AND expires_at > datetime('now')
    `).get(cacheKey);

    if (row) {
      const stats = JSON.parse(row.stats);
      return {
        phase: 'pack',
        success: true,
        target: stats.target || '',
        query: row.query || '',
        stats: {
          fileCount: stats.fileCount || 0,
          totalTokens: stats.totalTokens || 0,
          totalCharacters: stats.totalCharacters || 0,
        },
        content: row.content,
        cachedAt: row.created_at,
      };
    }
  } catch {
    // Cache miss
  }
  return null;
}

function storePackCache(
  db: Database,
  cacheKey: string,
  target: string,
  query: string,
  stats: PackResult['stats'],
  content: string,
  ttlHours: number
): void {
  try {
    db.run(`
      INSERT OR REPLACE INTO repomix_cache (id, target, options, content, stats, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', '+${ttlHours} hour'))
    `, [cacheKey, target, query, content, JSON.stringify({ ...stats, target })]);
  } catch {
    // Silently ignore cache errors
  }
}

function cleanExpiredCache(db: Database): void {
  try {
    db.run(`DELETE FROM repomix_cache WHERE expires_at < datetime('now')`);
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Index Cache (for file trees)
// ============================================================================

interface CachedIndex {
  files: FileInfo[];
  fetchedAt: string;
}

function checkIndexCache(db: Database, target: string, branch?: string): CachedIndex | null {
  try {
    const cacheKey = `index:${target}:${branch || 'default'}`;
    const row = db.query<{ content: string; created_at: string }, [string]>(`
      SELECT content, created_at
      FROM repomix_cache
      WHERE id = ? AND expires_at > datetime('now')
    `).get(cacheKey);

    if (row) {
      return {
        files: JSON.parse(row.content),
        fetchedAt: row.created_at,
      };
    }
  } catch {
    // Cache miss
  }
  return null;
}

function storeIndexCache(db: Database, target: string, branch: string | undefined, files: FileInfo[]): void {
  try {
    const cacheKey = `index:${target}:${branch || 'default'}`;
    db.run(`
      INSERT OR REPLACE INTO repomix_cache (id, target, options, content, stats, created_at, expires_at)
      VALUES (?, ?, 'index', ?, '{}', datetime('now'), datetime('now', '+24 hour'))
    `, [cacheKey, target, JSON.stringify(files)]);
  } catch {
    // Silently ignore
  }
}

// ============================================================================
// GitHub API - Fetch File Tree
// ============================================================================

interface GitHubTreeItem {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

async function fetchGitHubTree(owner: string, repo: string, branch?: string): Promise<FileInfo[]> {
  const ref = branch || 'HEAD';
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Matrix-Repomix/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { tree: GitHubTreeItem[]; truncated: boolean };

  if (data.truncated) {
    console.warn('GitHub tree was truncated - very large repository');
  }

  const files: FileInfo[] = [];

  for (const item of data.tree) {
    if (item.type === 'blob' && item.size !== undefined) {
      // Skip excluded files
      if (shouldExcludeFile(item.path)) continue;

      // Skip very large files (>500KB)
      if (item.size > 500 * 1024) continue;

      // Only include code files
      if (!/\.[jt]sx?$|\.py$|\.go$|\.rs$|\.java$|\.c$|\.cpp$|\.h$|\.rb$/.test(item.path)) continue;

      files.push({
        path: item.path,
        size: item.size,
        estimatedTokens: Math.round(item.size / 4), // ~4 chars per token
      });
    }
  }

  return files;
}

// ============================================================================
// Local Directory - Fetch File Tree
// ============================================================================

function fetchLocalTree(dirPath: string, basePath: string = ''): FileInfo[] {
  const files: FileInfo[] = [];

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (shouldExcludeFile(relativePath + '/')) continue;

        files.push(...fetchLocalTree(fullPath, relativePath));
      } else if (entry.isFile()) {
        // Skip excluded files
        if (shouldExcludeFile(relativePath)) continue;

        // Only include code files
        if (!/\.[jt]sx?$|\.py$|\.go$|\.rs$|\.java$|\.c$|\.cpp$|\.h$|\.rb$/.test(relativePath)) continue;

        try {
          const stat = statSync(fullPath);

          // Skip very large files
          if (stat.size > 500 * 1024) continue;

          files.push({
            path: relativePath,
            size: stat.size,
            estimatedTokens: Math.round(stat.size / 4),
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return files;
}

// ============================================================================
// Semantic Search - Find Relevant Files
// ============================================================================

async function findRelevantFiles(
  files: FileInfo[],
  query: string,
  maxFiles: number
): Promise<FileInfo[]> {
  if (files.length === 0) return [];
  if (files.length <= maxFiles) return files;

  // Get query embedding
  const queryEmbedding = await getEmbedding(query);

  // Create text for each file based on path (which often contains semantic info)
  // e.g., "src/auth/oauth.ts" → "auth oauth authentication"
  const fileTexts = files.map(f => {
    const pathParts = f.path
      .replace(/\.[^.]+$/, '') // Remove extension
      .split(/[\/\\]/)
      .join(' ');
    return pathParts;
  });

  // Get embeddings for all file paths
  const fileEmbeddings = await getEmbeddings(fileTexts);

  // Score and sort files
  const scored = files.map((file, i) => ({
    file,
    score: cosineSimilarity(queryEmbedding, fileEmbeddings[i]!),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Return top N files
  return scored.slice(0, maxFiles).map(s => s.file);
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Phase 1: Index repository and find relevant files
 */
async function indexRepository(
  db: Database,
  target: string,
  query: string,
  branch?: string,
  maxFiles: number = 15
): Promise<IndexResult> {
  // Check if remote or local
  const isRemote = isValidShorthand(target) || isValidRemoteValue(target);

  let files: FileInfo[];

  // Check index cache first
  const cached = checkIndexCache(db, target, branch);
  if (cached) {
    files = cached.files;
  } else {
    // Fetch fresh file tree
    if (isRemote) {
      // Parse GitHub shorthand
      const match = target.match(/^([^\/]+)\/([^\/]+)$/);
      if (!match) {
        throw new Error(`Invalid GitHub shorthand: ${target}. Use format: owner/repo`);
      }
      const [, owner, repo] = match;
      files = await fetchGitHubTree(owner!, repo!, branch);
    } else {
      // Local path
      const cwd = process.cwd();
      const localPath = target.startsWith('/') ? target : join(cwd, target);
      if (!existsSync(localPath)) {
        throw new Error(`Path not found: ${localPath}`);
      }
      files = fetchLocalTree(localPath);
    }

    // Cache the index
    storeIndexCache(db, target, branch, files);
  }

  // Calculate totals
  const totalFiles = files.length;
  const totalEstimatedTokens = files.reduce((sum, f) => sum + f.estimatedTokens, 0);

  // Find relevant files using semantic search
  const suggestedFiles = await findRelevantFiles(files, query, maxFiles);
  const suggestedTokens = suggestedFiles.reduce((sum, f) => sum + f.estimatedTokens, 0);

  return {
    phase: 'index',
    target,
    query,
    branch,
    totalFiles,
    totalEstimatedTokens,
    suggestedFiles,
    suggestedTokens,
    message: `Found ${totalFiles} code files (~${Math.round(totalEstimatedTokens / 1000)}k tokens total). ` +
             `Suggesting ${suggestedFiles.length} relevant files (~${Math.round(suggestedTokens / 1000)}k tokens).`,
  };
}

/**
 * Phase 2: Pack confirmed files
 */
async function packConfirmedFiles(
  db: Database,
  target: string,
  query: string,
  confirmedFiles: string[],
  branch?: string,
  maxTokens: number = 30000,
  cacheTTLHours: number = DEFAULT_CACHE_TTL_HOURS
): Promise<PackResult> {
  // Check cache
  const cacheKey = getCacheKey(target, query, confirmedFiles);
  const cached = checkPackCache(db, cacheKey);
  if (cached) {
    return cached;
  }

  // Build include pattern from confirmed files
  const includePattern = confirmedFiles.join(',');

  // Determine if remote or local
  const isRemote = isValidShorthand(target) || isValidRemoteValue(target);

  // Build CLI options
  const cliOptions: CliOptions = {
    style: 'markdown',
    compress: false,
    stdout: false,
    copy: false,
    securityCheck: true,
    quiet: true,
    include: includePattern,
  };

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

  let result: { packResult?: { totalFiles: number; totalTokens: number; totalCharacters: number } };

  try {
    if (isRemote) {
      result = await runRemoteAction(target, cliOptions);
    } else {
      const cwd = process.cwd();
      const localPath = target.startsWith('/') ? target : join(cwd, target);
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
        phase: 'pack',
        success: false,
        target,
        query,
        stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0 },
        content: '',
        error: 'No output generated',
      };
    }

    // Truncate if needed
    const maxChars = maxTokens * 4;
    let truncated = false;
    if (content.length > maxChars) {
      content = content.slice(0, maxChars);
      content += `\n\n[TRUNCATED to ${maxTokens} tokens. Request fewer files for complete content.]`;
      truncated = true;
    }

    const stats: PackResult['stats'] = {
      fileCount: result.packResult?.totalFiles || confirmedFiles.length,
      totalTokens: result.packResult?.totalTokens || Math.round(content.length / 4),
      totalCharacters: result.packResult?.totalCharacters || content.length,
    };

    // Cache the result
    storePackCache(db, cacheKey, target, query, stats, content, cacheTTLHours);

    return {
      phase: 'pack',
      success: true,
      target,
      query,
      stats,
      content,
    };

  } catch (err) {
    return {
      phase: 'pack',
      success: false,
      target,
      query,
      stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0 },
      content: '',
      error: `Pack failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Smart repository packing with query-driven semantic search
 *
 * Phase 1 (no confirmedFiles): Returns index with suggested files
 * Phase 2 (with confirmedFiles): Packs the confirmed files
 */
export async function packRepository(options: RepomixOptions): Promise<RepomixResult> {
  const {
    target,
    query,
    branch,
    confirmedFiles,
    maxTokens = 30000,
    maxFiles = 15,
    cacheTTLHours = DEFAULT_CACHE_TTL_HOURS,
  } = options;

  if (!query || query.trim() === '') {
    return {
      phase: 'pack',
      success: false,
      target,
      query: '',
      stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0 },
      content: '',
      error: 'Query is required. What implementation are you looking for?',
    };
  }

  // Open database
  let db: Database;
  try {
    db = new Database(DB_PATH);
  } catch (err) {
    return {
      phase: 'pack',
      success: false,
      target,
      query,
      stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0 },
      content: '',
      error: `Database error: ${err}`,
    };
  }

  try {
    // Clean expired cache periodically
    cleanExpiredCache(db);

    // Phase 2: Pack confirmed files
    if (confirmedFiles && confirmedFiles.length > 0) {
      return await packConfirmedFiles(db, target, query, confirmedFiles, branch, maxTokens, cacheTTLHours);
    }

    // Phase 1: Index and find relevant files
    return await indexRepository(db, target, query, branch, maxFiles);

  } catch (err) {
    return {
      phase: 'pack',
      success: false,
      target,
      query,
      stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0 },
      content: '',
      error: `Failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    db.close();
  }
}

/**
 * Format result for display
 */
export function formatResult(result: RepomixResult): string {
  if (result.phase === 'index') {
    // Phase 1: Return structured data for Claude to process
    const fileList = result.suggestedFiles
      .map((f, i) => `${i + 1}. ${f.path} (~${Math.round(f.estimatedTokens / 1000)}k tokens)`)
      .join('\n');

    return JSON.stringify({
      phase: 'index',
      message: result.message,
      action_required: 'ASK_USER_CONFIRMATION',
      instructions: `Ask the user to confirm which files to pack using Bash interactive prompt. Show them the suggested files and estimated tokens. After confirmation, call matrix_repomix again with confirmedFiles parameter.`,
      data: {
        target: result.target,
        query: result.query,
        branch: result.branch,
        totalFiles: result.totalFiles,
        totalEstimatedTokens: result.totalEstimatedTokens,
        suggestedFiles: result.suggestedFiles,
        suggestedTokens: result.suggestedTokens,
      },
      suggested_prompt: `Repository: ${result.target}
Query: "${result.query}"

${result.message}

Suggested files:
${fileList}

Pack these ${result.suggestedFiles.length} files? [y/n/custom]`,
    }, null, 2);
  }

  // Phase 2: Pack result
  if (!result.success) {
    return `Error packing ${result.target}: ${result.error}`;
  }

  const header = [
    `# Repository: ${result.target}`,
    `Query: "${result.query}"`,
    `Files: ${result.stats.fileCount} | Tokens: ~${Math.round(result.stats.totalTokens / 1000)}k`,
  ];

  if (result.cachedAt) {
    header.push(`(cached at ${result.cachedAt})`);
  }

  return `${header.join('\n')}\n\n${result.content}`;
}

// Re-export types
export type { RepomixOptions };
