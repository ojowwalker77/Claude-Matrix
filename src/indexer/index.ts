/**
 * Repository Indexer
 *
 * Main entry point for indexing multi-language repositories.
 * Extracts symbols (functions, classes, types) and import relationships
 * for code navigation using tree-sitter.
 */

import { readFile } from 'fs/promises';
import { scanRepository } from './scanner.js';
import { parseFile } from './parser.js';
import { computeDiff, hasChanges, getDiffSummary } from './diff.js';
import {
  getIndexedFiles,
  upsertFile,
  deleteFile,
  clearFileIndex,
  insertSymbols,
  insertImports,
  getIndexStatus,
} from './store.js';
import type { IndexerOptions, IndexResult, ScannedFile } from './types.js';

/**
 * Index a repository for code navigation
 *
 * @param options - Indexer configuration
 * @returns Result with statistics
 */
export async function indexRepository(options: IndexerOptions): Promise<IndexResult> {
  const {
    repoRoot,
    repoId,
    incremental = true,
    maxFileSize = 1024 * 1024, // 1MB
    excludePatterns = [],
    timeout = 60,
    includeTests = false,
    onProgress,
  } = options;

  const startTime = Date.now();
  const timeoutMs = timeout * 1000;

  let filesScanned = 0;
  let filesIndexed = 0;
  let filesSkipped = 0;
  let symbolsFound = 0;
  let importsFound = 0;
  const MAX_ERRORS = 100;
  const errors: string[] = [];
  let errorsCapped = false;

  try {
    // Step 1: Scan repository for files
    onProgress?.('Scanning repository...', 0);

    const scannedFiles = await scanRepository({
      repoRoot,
      excludePatterns,
      maxFileSize,
      includeTests,
    });

    filesScanned = scannedFiles.length;
    onProgress?.(`Found ${filesScanned} files`, 5);

    // Step 2: Get indexed files and compute diff
    let filesToProcess: ScannedFile[] = [];
    let filesToDelete: string[] = [];

    if (incremental) {
      const indexedFiles = getIndexedFiles(repoId);
      const diff = computeDiff(scannedFiles, indexedFiles);

      if (!hasChanges(diff)) {
        onProgress?.('Index up to date', 100);
        return {
          success: true,
          filesScanned,
          filesIndexed: 0,
          filesSkipped: filesScanned,
          symbolsFound: 0,
          importsFound: 0,
          duration: Date.now() - startTime,
        };
      }

      filesToProcess = [...diff.added, ...diff.modified];
      filesToDelete = diff.deleted;
      filesSkipped = filesScanned - filesToProcess.length;

      onProgress?.(`Changes: ${getDiffSummary(diff)}`, 10);
    } else {
      // Full re-index
      filesToProcess = scannedFiles;
    }

    // Step 3: Delete removed files
    for (const filePath of filesToDelete) {
      deleteFile(repoId, filePath);
    }

    // Step 4: Process changed files
    const totalToProcess = filesToProcess.length;

    for (let i = 0; i < totalToProcess; i++) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        if (!errorsCapped && errors.length < MAX_ERRORS) {
          errors.push(`Timeout after ${timeout}s, indexed ${filesIndexed}/${totalToProcess} files`);
        }
        break;
      }

      const file = filesToProcess[i];
      if (!file) continue;
      const progress = Math.floor(10 + (i / totalToProcess) * 85);
      onProgress?.(`Indexing: ${file.path}`, progress);

      try {
        // Read file content
        const content = await readFile(file.absolutePath, 'utf-8');

        // Upsert file record
        const fileId = upsertFile(repoId, file.path, file.mtime);

        // Clear existing symbols/imports for this file
        clearFileIndex(fileId);

        // Parse file (async tree-sitter)
        const result = await parseFile(file.path, content);

        // Store symbols
        if (result.symbols.length > 0) {
          const count = insertSymbols(repoId, fileId, result.symbols);
          symbolsFound += count;
        }

        // Store imports
        if (result.imports.length > 0) {
          const count = insertImports(fileId, result.imports);
          importsFound += count;
        }

        // Track parse errors (capped to prevent memory issues)
        if (result.errors && result.errors.length > 0 && !errorsCapped) {
          for (const e of result.errors) {
            if (errors.length < MAX_ERRORS) {
              errors.push(`${file.path}: ${e}`);
            } else {
              errors.push(`... and more errors (capped at ${MAX_ERRORS})`);
              errorsCapped = true;
              break;
            }
          }
        }

        filesIndexed++;
      } catch (err) {
        if (!errorsCapped) {
          const msg = err instanceof Error ? err.message : String(err);
          if (errors.length < MAX_ERRORS) {
            errors.push(`${file.path}: ${msg}`);
          } else {
            errors.push(`... and more errors (capped at ${MAX_ERRORS})`);
            errorsCapped = true;
          }
        }
      }
    }

    onProgress?.('Indexing complete', 100);

    return {
      success: errors.length === 0,
      filesScanned,
      filesIndexed,
      filesSkipped,
      symbolsFound,
      importsFound,
      duration: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      filesScanned,
      filesIndexed,
      filesSkipped,
      symbolsFound,
      importsFound,
      duration: Date.now() - startTime,
      errors: [msg],
    };
  }
}

// Re-export types and utilities
export { getIndexStatus } from './store.js';
export type { IndexerOptions, IndexResult, IndexStatus } from './types.js';
