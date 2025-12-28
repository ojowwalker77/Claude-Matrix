/**
 * Index Store
 *
 * SQLite operations for the code index.
 * Handles storing and querying symbols, imports, and file metadata.
 */

import { getDb } from '../db/client.js';
import type {
  ExtractedSymbol,
  ExtractedImport,
  RepoFileRow,
  ImportRow,
  DefinitionResult,
  ExportResult,
  IndexStatus,
  SymbolKind,
} from './types.js';

/**
 * Get all indexed files for a repository
 */
export function getIndexedFiles(repoId: string): Map<string, RepoFileRow> {
  const db = getDb();
  const rows = db.query(`
    SELECT id, repo_id, file_path, mtime, hash, indexed_at
    FROM repo_files
    WHERE repo_id = ?
  `).all(repoId) as RepoFileRow[];

  const map = new Map<string, RepoFileRow>();
  for (const row of rows) {
    map.set(row.file_path, row);
  }
  return map;
}

/**
 * Insert or update a file in the index
 */
export function upsertFile(
  repoId: string,
  filePath: string,
  mtime: number,
  hash?: string
): number {
  const db = getDb();

  // Try to update first
  const updateResult = db.query(`
    UPDATE repo_files
    SET mtime = ?, hash = ?, indexed_at = datetime('now')
    WHERE repo_id = ? AND file_path = ?
  `).run(mtime, hash ?? null, repoId, filePath);

  if (updateResult.changes > 0) {
    // Get the existing file ID
    const row = db.query(`
      SELECT id FROM repo_files WHERE repo_id = ? AND file_path = ?
    `).get(repoId, filePath) as { id: number } | null;
    return row?.id ?? 0;
  }

  // Insert new file
  const insertResult = db.query(`
    INSERT INTO repo_files (repo_id, file_path, mtime, hash)
    VALUES (?, ?, ?, ?)
  `).run(repoId, filePath, mtime, hash ?? null);

  return Number(insertResult.lastInsertRowid);
}

/**
 * Delete a file from the index (cascades to symbols and imports)
 */
export function deleteFile(repoId: string, filePath: string): void {
  const db = getDb();

  // Get file ID first
  const row = db.query(`
    SELECT id FROM repo_files WHERE repo_id = ? AND file_path = ?
  `).get(repoId, filePath) as { id: number } | null;

  if (!row) return;

  // Delete symbols and imports (cascade should handle this, but be explicit)
  db.query('DELETE FROM symbol_refs WHERE file_id = ?').run(row.id);
  db.query('DELETE FROM symbols WHERE file_id = ?').run(row.id);
  db.query('DELETE FROM imports WHERE file_id = ?').run(row.id);
  db.query('DELETE FROM repo_files WHERE id = ?').run(row.id);
}

/**
 * Clear all symbols and imports for a file (before re-indexing)
 */
export function clearFileIndex(fileId: number): void {
  const db = getDb();
  db.query('DELETE FROM symbol_refs WHERE file_id = ?').run(fileId);
  db.query('DELETE FROM symbols WHERE file_id = ?').run(fileId);
  db.query('DELETE FROM imports WHERE file_id = ?').run(fileId);
}

/**
 * Insert symbols for a file
 */
export function insertSymbols(
  repoId: string,
  fileId: number,
  symbols: ExtractedSymbol[]
): number {
  const db = getDb();
  let count = 0;

  const stmt = db.query(`
    INSERT INTO symbols (
      repo_id, file_id, name, kind, line, column, end_line,
      exported, is_default, scope, signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const sym of symbols) {
    stmt.run(
      repoId,
      fileId,
      sym.name,
      sym.kind,
      sym.line,
      sym.column,
      sym.endLine ?? null,
      sym.exported ? 1 : 0,
      sym.isDefault ? 1 : 0,
      sym.scope ?? null,
      sym.signature ?? null
    );
    count++;
  }

  return count;
}

/**
 * Insert imports for a file
 */
export function insertImports(fileId: number, imports: ExtractedImport[]): number {
  const db = getDb();
  let count = 0;

  const stmt = db.query(`
    INSERT INTO imports (
      file_id, imported_name, local_name, source_path,
      is_default, is_namespace, is_type, line
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const imp of imports) {
    stmt.run(
      fileId,
      imp.importedName,
      imp.localName ?? null,
      imp.sourcePath,
      imp.isDefault ? 1 : 0,
      imp.isNamespace ? 1 : 0,
      imp.isType ? 1 : 0,
      imp.line
    );
    count++;
  }

  return count;
}

/**
 * Find symbol definitions by name
 */
export function findDefinitions(
  repoId: string,
  symbolName: string,
  kind?: SymbolKind,
  filePath?: string
): DefinitionResult[] {
  const db = getDb();

  let query = `
    SELECT
      s.name, s.kind, s.line, s.column, s.signature,
      s.exported, s.is_default, s.scope,
      f.file_path
    FROM symbols s
    JOIN repo_files f ON s.file_id = f.id
    WHERE s.repo_id = ? AND s.name = ?
  `;

  const params: (string | number)[] = [repoId, symbolName];

  if (kind) {
    query += ' AND s.kind = ?';
    params.push(kind);
  }

  if (filePath) {
    query += ' AND f.file_path = ?';
    params.push(filePath);
  }

  query += ' ORDER BY s.exported DESC, f.file_path ASC';

  const rows = db.query(query).all(...params) as Array<{
    name: string;
    kind: string;
    line: number;
    column: number;
    signature: string | null;
    exported: number;
    is_default: number;
    scope: string | null;
    file_path: string;
  }>;

  return rows.map(row => ({
    file: row.file_path,
    line: row.line,
    column: row.column,
    kind: row.kind as SymbolKind,
    signature: row.signature ?? undefined,
    exported: row.exported === 1,
    isDefault: row.is_default === 1,
    scope: row.scope ?? undefined,
  }));
}

/**
 * Find all exported symbols (optionally filtered by file/directory)
 */
export function findExports(
  repoId: string,
  pathPrefix?: string
): ExportResult[] {
  const db = getDb();

  let query = `
    SELECT
      s.name, s.kind, s.line, s.is_default,
      f.file_path
    FROM symbols s
    JOIN repo_files f ON s.file_id = f.id
    WHERE s.repo_id = ? AND s.exported = 1
  `;

  const params: string[] = [repoId];

  if (pathPrefix) {
    query += ' AND f.file_path LIKE ?';
    params.push(`${pathPrefix}%`);
  }

  query += ' ORDER BY f.file_path ASC, s.line ASC';

  const rows = db.query(query).all(...params) as Array<{
    name: string;
    kind: string;
    line: number;
    is_default: number;
    file_path: string;
  }>;

  return rows.map(row => ({
    name: row.name,
    kind: row.kind as SymbolKind,
    file: row.file_path,
    line: row.line,
    isDefault: row.is_default === 1,
  }));
}

/**
 * Get index status for a repository
 */
export function getIndexStatus(repoId: string, repoName: string): IndexStatus {
  const db = getDb();

  // Get file count
  const fileCount = db.query(`
    SELECT COUNT(*) as count FROM repo_files WHERE repo_id = ?
  `).get(repoId) as { count: number };

  // Get symbol count
  const symbolCount = db.query(`
    SELECT COUNT(*) as count FROM symbols WHERE repo_id = ?
  `).get(repoId) as { count: number };

  // Get import count
  const importCount = db.query(`
    SELECT COUNT(*) as count FROM imports i
    JOIN repo_files f ON i.file_id = f.id
    WHERE f.repo_id = ?
  `).get(repoId) as { count: number };

  // Get last indexed time
  const lastIndexed = db.query(`
    SELECT MAX(indexed_at) as last FROM repo_files WHERE repo_id = ?
  `).get(repoId) as { last: string | null };

  return {
    repoName,
    repoId,
    filesIndexed: fileCount.count,
    symbolCount: symbolCount.count,
    importCount: importCount.count,
    lastIndexed: lastIndexed.last,
    staleFiles: 0, // Will be calculated by diff
  };
}

/**
 * Search symbols by partial name match
 */
export function searchSymbols(
  repoId: string,
  query: string,
  limit: number = 20
): DefinitionResult[] {
  const db = getDb();

  const rows = db.query(`
    SELECT
      s.name, s.kind, s.line, s.column, s.signature,
      s.exported, s.is_default, s.scope,
      f.file_path
    FROM symbols s
    JOIN repo_files f ON s.file_id = f.id
    WHERE s.repo_id = ? AND s.name LIKE ?
    ORDER BY
      CASE WHEN s.name = ? THEN 0 ELSE 1 END,
      s.exported DESC,
      LENGTH(s.name) ASC
    LIMIT ?
  `).all(repoId, `%${query}%`, query, limit) as Array<{
    name: string;
    kind: string;
    line: number;
    column: number;
    signature: string | null;
    exported: number;
    is_default: number;
    scope: string | null;
    file_path: string;
  }>;

  return rows.map(row => ({
    file: row.file_path,
    line: row.line,
    column: row.column,
    kind: row.kind as SymbolKind,
    signature: row.signature ?? undefined,
    exported: row.exported === 1,
    isDefault: row.is_default === 1,
    scope: row.scope ?? undefined,
  }));
}

/**
 * Get imports for a file
 */
export function getFileImports(repoId: string, filePath: string): ExtractedImport[] {
  const db = getDb();

  const rows = db.query(`
    SELECT
      i.imported_name, i.local_name, i.source_path,
      i.is_default, i.is_namespace, i.is_type, i.line
    FROM imports i
    JOIN repo_files f ON i.file_id = f.id
    WHERE f.repo_id = ? AND f.file_path = ?
    ORDER BY i.line ASC
  `).all(repoId, filePath) as ImportRow[];

  return rows.map(row => ({
    importedName: row.imported_name,
    localName: row.local_name ?? undefined,
    sourcePath: row.source_path,
    isDefault: row.is_default === 1,
    isNamespace: row.is_namespace === 1,
    isType: row.is_type === 1,
    line: row.line,
  }));
}

/**
 * Clear entire index for a repository
 */
export function clearRepoIndex(repoId: string): void {
  const db = getDb();

  // Get all file IDs
  const files = db.query(`
    SELECT id FROM repo_files WHERE repo_id = ?
  `).all(repoId) as { id: number }[];

  for (const file of files) {
    db.query('DELETE FROM symbol_refs WHERE file_id = ?').run(file.id);
    db.query('DELETE FROM symbols WHERE file_id = ?').run(file.id);
    db.query('DELETE FROM imports WHERE file_id = ?').run(file.id);
  }

  db.query('DELETE FROM repo_files WHERE repo_id = ?').run(repoId);
}
