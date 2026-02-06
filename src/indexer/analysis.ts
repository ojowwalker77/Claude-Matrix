/**
 * Code Analysis
 *
 * Dead code detection, orphaned file detection, and circular dependency analysis.
 * Builds on the existing index store (symbols, imports, repo_files tables).
 */

import { getDb } from '../db/client.js';
import { findExports, findCallers } from './store.js';
import type { ExportResult, SymbolKind } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface DeadExport {
  symbol: string;
  kind: SymbolKind;
  file: string;
  line: number;
  signature?: string;
}

export interface OrphanedFile {
  file: string;
  exportCount: number;
  symbolCount: number;
}

export interface CircularDependency {
  cycle: string[];
  length: number;
}

export interface DeadCodeResult {
  deadExports?: DeadExport[];
  orphanedFiles?: OrphanedFile[];
  summary: {
    deadExportCount: number;
    orphanedFileCount: number;
    filesAnalyzed: number;
    symbolsAnalyzed: number;
  };
}

export interface CircularDepsResult {
  cycles: CircularDependency[];
  summary: {
    totalCycles: number;
    filesInCycles: number;
    longestCycle: number;
  };
}

// ============================================================================
// Import Graph
// ============================================================================

interface ImportGraphData {
  /** file_path -> Set of file_paths it imports */
  outgoing: Map<string, Set<string>>;
  /** file_path -> Set of file_paths that import it */
  incoming: Map<string, Set<string>>;
  /** All known file paths (full repo, used for resolution) */
  allFiles: Set<string>;
  /** Files within the analysis scope (filtered by pathPrefix) */
  scopeFiles: Set<string>;
}

/**
 * Resolve an import source path to an actual indexed file path.
 *
 * Handles relative paths (./foo, ../bar), extension resolution (.ts/.tsx/.js/.jsx/.mjs),
 * and index file resolution (foo/index.ts).
 *
 * Returns null for external packages (no ./ or ../ prefix).
 */
function resolveImportPath(
  fromFile: string,
  sourcePath: string,
  knownFiles: Set<string>,
): string | null {
  // Skip external packages
  if (!sourcePath.startsWith('.')) {
    return null;
  }

  // Compute the directory of the importing file
  const lastSlash = fromFile.lastIndexOf('/');
  const fromDir = lastSlash >= 0 ? fromFile.slice(0, lastSlash) : '';

  // Resolve the relative path
  const segments = fromDir ? fromDir.split('/') : [];
  for (const part of sourcePath.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      if (segments.length > 0) segments.pop();
    } else {
      segments.push(part);
    }
  }
  const base = segments.join('/');

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

  // Try exact match first (already has extension)
  if (knownFiles.has(base)) return base;

  // Try with extensions
  for (const ext of extensions) {
    const candidate = base + ext;
    if (knownFiles.has(candidate)) return candidate;
  }

  // Try as directory with /index
  for (const ext of extensions) {
    const candidate = base + '/index' + ext;
    if (knownFiles.has(candidate)) return candidate;
  }

  return null;
}

/**
 * Build the import graph from the index database.
 * Returns both outgoing (what each file imports) and incoming (who imports each file) edges.
 */
function buildImportGraph(repoId: string, pathPrefix?: string): ImportGraphData {
  const db = getDb();

  // Load ALL files for import resolution (unfiltered) to prevent
  // false positives from cross-boundary imports failing to resolve
  const allFileRows = db.query('SELECT id, file_path FROM repo_files WHERE repo_id = ?')
    .all(repoId) as Array<{ id: number; file_path: string }>;

  const allFiles = new Set<string>();
  const fileIdToPath = new Map<number, string>();
  for (const f of allFileRows) {
    allFiles.add(f.file_path);
    fileIdToPath.set(f.id, f.file_path);
  }

  // Determine analysis scope (filtered by pathPrefix)
  const scopeFiles = new Set<string>();
  if (pathPrefix) {
    for (const f of allFiles) {
      if (f.startsWith(pathPrefix)) scopeFiles.add(f);
    }
  } else {
    for (const f of allFiles) scopeFiles.add(f);
  }

  // Get imports from scope files only (outgoing edges)
  const imports = db.query(`
    SELECT i.file_id, i.source_path
    FROM imports i
    JOIN repo_files f ON i.file_id = f.id
    WHERE f.repo_id = ?
    ${pathPrefix ? 'AND f.file_path LIKE ?' : ''}
  `).all(...(pathPrefix ? [repoId, `${pathPrefix}%`] : [repoId])) as Array<{ file_id: number; source_path: string }>;

  // Build adjacency lists
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  for (const filePath of allFiles) {
    outgoing.set(filePath, new Set());
    incoming.set(filePath, new Set());
  }

  for (const imp of imports) {
    const fromFile = fileIdToPath.get(imp.file_id);
    if (!fromFile) continue;

    // Resolve against ALL files (not just scope) for accurate cross-boundary resolution
    const resolved = resolveImportPath(fromFile, imp.source_path, allFiles);
    if (!resolved) continue;

    outgoing.get(fromFile)?.add(resolved);
    incoming.get(resolved)?.add(fromFile);
  }

  return { outgoing, incoming, allFiles, scopeFiles };
}

// ============================================================================
// Dead Export Detection
// ============================================================================

/**
 * Find exported symbols that have zero callers across the codebase.
 * Uses the existing findCallers() function for proven path-matching accuracy.
 */
export function findDeadExports(
  repoId: string,
  pathPrefix?: string,
  entryPointPatterns?: string[],
  limit: number = 100,
): DeadExport[] {
  // Get all exports
  const exports = findExports(repoId, pathPrefix);

  // Build entry point matcher
  const isEntryPoint = buildEntryPointMatcher(entryPointPatterns || []);

  const deadExports: DeadExport[] = [];

  for (const exp of exports) {
    if (deadExports.length >= limit) break;

    // Skip entry point files
    if (isEntryPoint(exp.file)) continue;

    // Check if this symbol has any callers
    const callers = findCallers(repoId, exp.name, exp.file);
    if (callers.length === 0) {
      deadExports.push({
        symbol: exp.name,
        kind: exp.kind,
        file: exp.file,
        line: exp.line,
      });
    }
  }

  return deadExports;
}

// ============================================================================
// Orphaned File Detection
// ============================================================================

/**
 * Find files that no other file imports (zero incoming edges in the import graph).
 * Excludes entry points and files matching framework conventions.
 */
export function findOrphanedFiles(
  repoId: string,
  pathPrefix?: string,
  entryPointPatterns?: string[],
  limit: number = 100,
): OrphanedFile[] {
  const db = getDb();
  const graph = buildImportGraph(repoId, pathPrefix);
  const isEntryPoint = buildEntryPointMatcher(entryPointPatterns || []);

  const orphaned: OrphanedFile[] = [];

  for (const filePath of graph.scopeFiles) {
    if (orphaned.length >= limit) break;

    // Skip entry points
    if (isEntryPoint(filePath)) continue;

    // Check incoming edges (from ALL files, not just scope)
    const importers = graph.incoming.get(filePath);
    if (importers && importers.size > 0) continue;

    // Get symbol stats for this file
    const stats = db.query(`
      SELECT
        COUNT(*) as symbol_count,
        SUM(CASE WHEN exported = 1 THEN 1 ELSE 0 END) as export_count
      FROM symbols s
      JOIN repo_files f ON s.file_id = f.id
      WHERE f.repo_id = ? AND f.file_path = ?
    `).get(repoId, filePath) as { symbol_count: number; export_count: number } | null;

    orphaned.push({
      file: filePath,
      exportCount: stats?.export_count ?? 0,
      symbolCount: stats?.symbol_count ?? 0,
    });
  }

  return orphaned;
}

// ============================================================================
// Circular Dependency Detection
// ============================================================================

/**
 * Detect circular dependencies in the import graph using DFS.
 */
export function findCircularDeps(
  repoId: string,
  pathPrefix?: string,
  maxDepth: number = 10,
): CircularDepsResult {
  const graph = buildImportGraph(repoId, pathPrefix);
  const rawCycles = detectCycles(graph.outgoing, maxDepth);
  const cycles = deduplicateCycles(rawCycles);

  // Count unique files involved in cycles
  const filesInCycles = new Set<string>();
  let longestCycle = 0;
  for (const cycle of cycles) {
    for (const file of cycle) {
      filesInCycles.add(file);
    }
    if (cycle.length > longestCycle) {
      longestCycle = cycle.length;
    }
  }

  return {
    cycles: cycles.map(c => ({
      cycle: c.length > 0 ? [...c, c[0]!] : [],
      length: c.length,
    })),
    summary: {
      totalCycles: cycles.length,
      filesInCycles: filesInCycles.size,
      longestCycle,
    },
  };
}

/**
 * DFS cycle detection on a directed graph.
 * Returns arrays of nodes forming cycles (without the closing node repeated).
 */
function detectCycles(
  graph: Map<string, Set<string>>,
  maxDepth: number,
): string[][] {
  const cycles: string[][] = [];
  const globalVisited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string, depth: number): void {
    if (depth > maxDepth) return;

    if (inStack.has(node)) {
      // Found a cycle - extract the cycle portion from the path
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart));
      }
      return;
    }

    if (globalVisited.has(node)) return;

    globalVisited.add(node);
    inStack.add(node);
    path.push(node);

    const neighbors = graph.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        dfs(neighbor, depth + 1);
      }
    }

    path.pop();
    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!globalVisited.has(node)) {
      dfs(node, 0);
    }
  }

  return cycles;
}

/**
 * Remove rotational duplicates from cycles.
 * e.g., [A, B, C] and [B, C, A] are the same cycle.
 */
function deduplicateCycles(cycles: string[][]): string[][] {
  const seen = new Set<string>();
  const unique: string[][] = [];

  for (const cycle of cycles) {
    const key = normalizeRotation(cycle);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(cycle);
    }
  }

  return unique;
}

/**
 * Create a canonical key for a cycle regardless of rotation.
 * Rotates to start with the lexicographically smallest element.
 */
function normalizeRotation(cycle: string[]): string {
  if (cycle.length === 0) return '';

  let minIdx = 0;
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i]! < cycle[minIdx]!) {
      minIdx = i;
    }
  }

  const rotated = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
  return rotated.join(' -> ');
}

// ============================================================================
// Entry Point Matching
// ============================================================================

/**
 * Build a function that checks if a file path matches known entry point patterns.
 *
 * Default patterns (always included):
 * - index.ts/js at any level
 * - main.ts/js, app.ts/js, server.ts/js
 * - bin/*, scripts/*
 * - *.config.ts/js
 * - CLI entry points
 *
 * Additional patterns can be provided (glob-like with * wildcards).
 */
function buildEntryPointMatcher(extraPatterns: string[]): (filePath: string) => boolean {
  // Default entry point patterns (as regex sources)
  const defaultPatterns = [
    /(?:^|\/)(index)\.(ts|tsx|js|jsx|mjs)$/,
    /^(main|app|server)\.(ts|tsx|js|jsx|mjs)$/,
    /(?:^|\/)bin\//,
    /(?:^|\/)scripts\//,
    /\.config\.(ts|js|mjs|cjs)$/,
    /(?:^|\/)cli\.(ts|js|mjs)$/,
    // Framework conventions
    /(?:^|\/)pages\//,
    /(?:^|\/)app\//,
    /(?:^|\/)routes\//,
    /(?:^|\/)migrations?\//,
    /(?:^|\/)seeds?\//,
  ];

  // Convert user globs to regex
  const extraRegexes = extraPatterns.map(pattern => {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*');
    return new RegExp(escaped);
  });

  const allPatterns = [...defaultPatterns, ...extraRegexes];

  return (filePath: string) => allPatterns.some(rx => rx.test(filePath));
}

// ============================================================================
// Aggregated Dead Code Analysis
// ============================================================================

/**
 * Run all structural dead code checks.
 * Used by the matrix_find_dead_code MCP tool.
 */
export function analyzeDeadCode(
  repoId: string,
  category: 'dead_exports' | 'orphaned_files' | 'all' = 'all',
  pathPrefix?: string,
  entryPoints?: string[],
  limit: number = 100,
): DeadCodeResult {
  const db = getDb();

  // Get total counts for summary
  const fileCount = db.query(
    `SELECT COUNT(*) as count FROM repo_files WHERE repo_id = ?${pathPrefix ? ' AND file_path LIKE ?' : ''}`,
  ).get(repoId, ...(pathPrefix ? [`${pathPrefix}%`] : [])) as { count: number };

  const symbolCount = db.query(
    `SELECT COUNT(*) as count FROM symbols WHERE repo_id = ? AND exported = 1`,
  ).get(repoId) as { count: number };

  let deadExports: DeadExport[] | undefined;
  let orphanedFiles: OrphanedFile[] | undefined;

  if (category === 'dead_exports' || category === 'all') {
    deadExports = findDeadExports(repoId, pathPrefix, entryPoints, limit);
  }

  if (category === 'orphaned_files' || category === 'all') {
    orphanedFiles = findOrphanedFiles(repoId, pathPrefix, entryPoints, limit);
  }

  return {
    deadExports,
    orphanedFiles,
    summary: {
      deadExportCount: deadExports?.length ?? 0,
      orphanedFileCount: orphanedFiles?.length ?? 0,
      filesAnalyzed: fileCount.count,
      symbolsAnalyzed: symbolCount.count,
    },
  };
}
