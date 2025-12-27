/**
 * Code Indexer Types
 *
 * Type definitions for the repository indexing system.
 */

// Symbol kinds we track
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'const'
  | 'method'
  | 'property'
  | 'namespace';

// A symbol extracted from source code
export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  line: number;           // 1-indexed
  column: number;         // 0-indexed
  endLine?: number;
  exported: boolean;
  isDefault: boolean;
  scope?: string;         // parent class/namespace
  signature?: string;     // function signature or type
}

// An import statement
export interface ExtractedImport {
  importedName: string;   // what's imported
  localName?: string;     // local alias if renamed
  sourcePath: string;     // from './foo' or 'lodash'
  isDefault: boolean;
  isNamespace: boolean;   // import * as X
  isType: boolean;        // import type { X }
  line: number;
}

// Result from parsing a single file
export interface ParseResult {
  symbols: ExtractedSymbol[];
  imports: ExtractedImport[];
  errors?: string[];
}

// File info from scanning
export interface ScannedFile {
  path: string;           // relative to repo root
  absolutePath: string;   // full path
  mtime: number;          // modification time (unix timestamp)
}

// Diff result for incremental updates
export interface FileDiff {
  added: ScannedFile[];
  modified: ScannedFile[];
  deleted: string[];      // file paths
}

// Indexer options
export interface IndexerOptions {
  repoRoot: string;
  repoId: string;
  incremental?: boolean;           // default: true
  maxFileSize?: number;            // skip files larger than N bytes (default: 1MB)
  excludePatterns?: string[];      // additional patterns to skip
  timeout?: number;                // max indexing time in seconds
  includeTests?: boolean;          // include test files (default: false)
  onProgress?: (message: string, percent: number) => void;
}

// Indexer result
export interface IndexResult {
  success: boolean;
  filesScanned: number;
  filesIndexed: number;
  filesSkipped: number;
  symbolsFound: number;
  importsFound: number;
  duration: number;        // ms
  errors?: string[];
}

// Database row types
export interface RepoFileRow {
  id: number;
  repo_id: string;
  file_path: string;
  mtime: number;
  hash: string | null;
  indexed_at: string;
}

export interface SymbolRow {
  id: number;
  repo_id: string;
  file_id: number;
  name: string;
  kind: string;
  line: number;
  column: number;
  end_line: number | null;
  exported: number;        // SQLite boolean
  is_default: number;      // SQLite boolean
  scope: string | null;
  signature: string | null;
}

export interface ImportRow {
  id: number;
  file_id: number;
  imported_name: string;
  local_name: string | null;
  source_path: string;
  is_default: number;
  is_namespace: number;
  is_type: number;
  line: number;
}

// Query result types for MCP tools
export interface DefinitionResult {
  file: string;
  line: number;
  column: number;
  kind: SymbolKind;
  signature?: string;
  exported: boolean;
  isDefault: boolean;
  scope?: string;
}

export interface ReferenceResult {
  file: string;
  line: number;
  column: number;
}

export interface ExportResult {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  isDefault: boolean;
}

export interface IndexStatus {
  repoName: string;
  repoId: string;
  filesIndexed: number;
  symbolCount: number;
  importCount: number;
  lastIndexed: string | null;
  staleFiles: number;
}
