/**
 * Repomix v2 - Query-First, Semantic Search
 *
 * Two-phase flow to minimize token consumption:
 * Phase 1: Index repo (no tokens) → suggest relevant files
 * Phase 2: Pack confirmed files only (tokens consumed)
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
const DEFAULT_CACHE_TTL = 24;

// ============================================================================
// Types
// ============================================================================

export interface FileInfo {
  path: string;
  size: number;
  estimatedTokens: number;
}

export interface RepomixOptions {
  target: string;
  query: string;
  branch?: string;
  confirmedFiles?: string[];
  maxTokens?: number;
  maxFiles?: number;
  cacheTTLHours?: number;
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
// Smart Exclusions
// ============================================================================

const EXCLUDED_PATTERNS = [
  /\/__tests__\//,
  /\/test\//,
  /\/tests\//,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /\/docs\//,
  /\/examples?\//,
  /\/fixtures?\//,
  /\/samples?\//,
  /\/dist\//,
  /\/build\//,
  /\/out\//,
  /\/.next\//,
  /\/node_modules\//,
  /\/vendor\//,
  /\.json$/,
  /\.yaml$/,
  /\.yml$/,
  /\.toml$/,
  /\.md$/,
  /\.txt$/,
  /\.lock$/,
  /\/\.vscode\//,
  /\/\.idea\//,
  /\/\.github\//,
];

function shouldExclude(path: string): boolean {
  return EXCLUDED_PATTERNS.some(p => p.test(path));
}

// ============================================================================
// Cache
// ============================================================================

function cacheKey(target: string, query: string, files?: string[]): string {
  const data = { target, query: query.toLowerCase().trim(), files: files?.sort() || [] };
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
}

function getPackCache(db: Database, key: string): PackResult | null {
  try {
    const row = db.query<{ content: string; stats: string; created_at: string; query: string }, [string]>(
      `SELECT content, stats, created_at, options as query FROM repomix_cache WHERE id = ? AND expires_at > datetime('now')`
    ).get(key);
    if (row) {
      const stats = JSON.parse(row.stats);
      return {
        phase: 'pack',
        success: true,
        target: stats.target || '',
        query: row.query || '',
        stats: { fileCount: stats.fileCount || 0, totalTokens: stats.totalTokens || 0, totalCharacters: stats.totalCharacters || 0 },
        content: row.content,
        cachedAt: row.created_at,
      };
    }
  } catch { /* miss */ }
  return null;
}

function setPackCache(db: Database, key: string, target: string, query: string, stats: PackResult['stats'], content: string, ttl: number): void {
  try {
    db.run(
      `INSERT OR REPLACE INTO repomix_cache (id, target, options, content, stats, created_at, expires_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', '+${ttl} hour'))`,
      [key, target, query, content, JSON.stringify({ ...stats, target })]
    );
  } catch { /* ignore */ }
}

function getIndexCache(db: Database, target: string, branch?: string): FileInfo[] | null {
  try {
    const key = `index:${target}:${branch || 'default'}`;
    const row = db.query<{ content: string }, [string]>(
      `SELECT content FROM repomix_cache WHERE id = ? AND expires_at > datetime('now')`
    ).get(key);
    if (row) return JSON.parse(row.content);
  } catch { /* miss */ }
  return null;
}

function setIndexCache(db: Database, target: string, branch: string | undefined, files: FileInfo[]): void {
  try {
    const key = `index:${target}:${branch || 'default'}`;
    db.run(
      `INSERT OR REPLACE INTO repomix_cache (id, target, options, content, stats, created_at, expires_at) VALUES (?, ?, 'index', ?, '{}', datetime('now'), datetime('now', '+24 hour'))`,
      [key, target, JSON.stringify(files)]
    );
  } catch { /* ignore */ }
}

function cleanCache(db: Database): void {
  try { db.run(`DELETE FROM repomix_cache WHERE expires_at < datetime('now')`); } catch { /* ignore */ }
}

// ============================================================================
// GitHub API
// ============================================================================

interface GitHubTree {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

async function fetchGitHubTree(owner: string, repo: string, branch?: string): Promise<FileInfo[]> {
  const ref = branch || 'HEAD';
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`, {
    headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Matrix-Repomix/1.0' },
  });
  if (!res.ok) throw new Error(`GitHub API: ${res.status} ${res.statusText}`);
  const data = await res.json() as { tree: GitHubTree[]; truncated: boolean };

  const files: FileInfo[] = [];
  for (const item of data.tree) {
    if (item.type !== 'blob' || !item.size) continue;
    if (shouldExclude(item.path)) continue;
    if (item.size > 500 * 1024) continue;
    if (!/\.[jt]sx?$|\.py$|\.go$|\.rs$|\.java$|\.c$|\.cpp$|\.h$|\.rb$/.test(item.path)) continue;
    files.push({ path: item.path, size: item.size, estimatedTokens: Math.round(item.size / 4) });
  }
  return files;
}

// ============================================================================
// Local Directory
// ============================================================================

function fetchLocalTree(dir: string, base: string = ''): FileInfo[] {
  const files: FileInfo[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldExclude(rel + '/')) files.push(...fetchLocalTree(full, rel));
      } else if (entry.isFile()) {
        if (shouldExclude(rel)) continue;
        if (!/\.[jt]sx?$|\.py$|\.go$|\.rs$|\.java$|\.c$|\.cpp$|\.h$|\.rb$/.test(rel)) continue;
        try {
          const stat = statSync(full);
          if (stat.size > 500 * 1024) continue;
          files.push({ path: rel, size: stat.size, estimatedTokens: Math.round(stat.size / 4) });
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
  return files;
}

// ============================================================================
// Semantic Search
// ============================================================================

async function findRelevantFiles(files: FileInfo[], query: string, max: number): Promise<FileInfo[]> {
  if (files.length === 0) return [];
  if (files.length <= max) return files;

  const queryEmbed = await getEmbedding(query);
  const pathTexts = files.map(f => f.path.replace(/\.[^.]+$/, '').split(/[/\\]/).join(' '));
  const pathEmbeds = await getEmbeddings(pathTexts);

  const scored = files.map((file, i) => ({ file, score: cosineSimilarity(queryEmbed, pathEmbeds[i]!) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map(s => s.file);
}

// ============================================================================
// Phase 1: Index
// ============================================================================

async function indexRepo(db: Database, target: string, query: string, branch?: string, maxFiles = 15): Promise<IndexResult> {
  const isRemote = isValidShorthand(target) || isValidRemoteValue(target);

  let files = getIndexCache(db, target, branch);
  if (!files) {
    if (isRemote) {
      const match = target.match(/^([^/]+)\/([^/]+)$/);
      if (!match) throw new Error(`Invalid GitHub shorthand: ${target}`);
      files = await fetchGitHubTree(match[1]!, match[2]!, branch);
    } else {
      const cwd = process.cwd();
      const path = target.startsWith('/') ? target : join(cwd, target);
      if (!existsSync(path)) throw new Error(`Path not found: ${path}`);
      files = fetchLocalTree(path);
    }
    setIndexCache(db, target, branch, files);
  }

  const totalFiles = files.length;
  const totalTokens = files.reduce((s, f) => s + f.estimatedTokens, 0);
  const suggested = await findRelevantFiles(files, query, maxFiles);
  const suggestedTokens = suggested.reduce((s, f) => s + f.estimatedTokens, 0);

  return {
    phase: 'index',
    target,
    query,
    branch,
    totalFiles,
    totalEstimatedTokens: totalTokens,
    suggestedFiles: suggested,
    suggestedTokens,
    message: `Found ${totalFiles} code files (~${Math.round(totalTokens / 1000)}k tokens). Suggesting ${suggested.length} relevant files (~${Math.round(suggestedTokens / 1000)}k tokens).`,
  };
}

// ============================================================================
// Phase 2: Pack
// ============================================================================

async function packFiles(db: Database, target: string, query: string, files: string[], branch?: string, maxTokens = 30000, ttl = DEFAULT_CACHE_TTL): Promise<PackResult> {
  const key = cacheKey(target, query, files);
  const cached = getPackCache(db, key);
  if (cached) return cached;

  const isRemote = isValidShorthand(target) || isValidRemoteValue(target);
  const opts: CliOptions = {
    style: 'markdown',
    compress: false,
    stdout: false,
    copy: false,
    securityCheck: true,
    quiet: true,
    include: files.join(','),
  };
  if (branch) opts.remoteBranch = branch;

  const tempDir = join(MATRIX_DIR, 'temp');
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
  const tempOut = join(tempDir, `repomix-${key}.txt`);
  opts.output = tempOut;

  try {
    let result: { packResult?: { totalFiles: number; totalTokens: number; totalCharacters: number } };
    if (isRemote) {
      result = await runRemoteAction(target, opts);
    } else {
      const cwd = process.cwd();
      const path = target.startsWith('/') ? target : join(cwd, target);
      result = await runDefaultAction([path], cwd, opts);
    }

    let content = existsSync(tempOut) ? readFileSync(tempOut, 'utf-8') : '';
    if (existsSync(tempOut)) rmSync(tempOut, { force: true });

    if (!content) {
      return { phase: 'pack', success: false, target, query, stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0 }, content: '', error: 'No output' };
    }

    const maxChars = maxTokens * 4;
    if (content.length > maxChars) {
      content = content.slice(0, maxChars) + `\n\n[TRUNCATED to ${maxTokens} tokens]`;
    }

    const stats: PackResult['stats'] = {
      fileCount: result.packResult?.totalFiles || files.length,
      totalTokens: result.packResult?.totalTokens || Math.round(content.length / 4),
      totalCharacters: result.packResult?.totalCharacters || content.length,
    };

    setPackCache(db, key, target, query, stats, content, ttl);
    return { phase: 'pack', success: true, target, query, stats, content };

  } catch (err) {
    return { phase: 'pack', success: false, target, query, stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0 }, content: '', error: String(err) };
  }
}

// ============================================================================
// Main Entry
// ============================================================================

export async function packRepository(options: RepomixOptions): Promise<RepomixResult> {
  const { target, query, branch, confirmedFiles, maxTokens = 30000, maxFiles = 15, cacheTTLHours = DEFAULT_CACHE_TTL } = options;

  if (!query?.trim()) {
    return { phase: 'pack', success: false, target, query: '', stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0 }, content: '', error: 'Query is required. What implementation are you looking for?' };
  }

  let db: Database;
  try {
    db = new Database(DB_PATH);
  } catch (err) {
    return { phase: 'pack', success: false, target, query, stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0 }, content: '', error: `DB error: ${err}` };
  }

  try {
    cleanCache(db);
    if (confirmedFiles?.length) {
      return await packFiles(db, target, query, confirmedFiles, branch, maxTokens, cacheTTLHours);
    }
    return await indexRepo(db, target, query, branch, maxFiles);
  } catch (err) {
    return { phase: 'pack', success: false, target, query, stats: { fileCount: 0, totalTokens: 0, totalCharacters: 0 }, content: '', error: String(err) };
  } finally {
    db.close();
  }
}

export function formatResult(result: RepomixResult): string {
  if (result.phase === 'index') {
    const list = result.suggestedFiles.map((f, i) => `${i + 1}. ${f.path} (~${Math.round(f.estimatedTokens / 1000)}k)`).join('\n');
    return JSON.stringify({
      phase: 'index',
      message: result.message,
      action_required: 'ASK_USER_CONFIRMATION',
      instructions: 'Ask user to confirm files via Bash prompt. Then call matrix_repomix again with confirmedFiles.',
      data: {
        target: result.target,
        query: result.query,
        branch: result.branch,
        totalFiles: result.totalFiles,
        totalEstimatedTokens: result.totalEstimatedTokens,
        suggestedFiles: result.suggestedFiles,
        suggestedTokens: result.suggestedTokens,
      },
      suggested_prompt: `Repository: ${result.target}\nQuery: "${result.query}"\n\n${result.message}\n\nSuggested files:\n${list}\n\nPack these ${result.suggestedFiles.length} files? [y/n/custom]`,
    }, null, 2);
  }

  if (!result.success) return `Error: ${result.error}`;

  const header = [`# Repository: ${result.target}`, `Query: "${result.query}"`, `Files: ${result.stats.fileCount} | Tokens: ~${Math.round(result.stats.totalTokens / 1000)}k`];
  if (result.cachedAt) header.push(`(cached at ${result.cachedAt})`);
  return `${header.join('\n')}\n\n${result.content}`;
}
