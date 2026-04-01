/**
 * File Diff
 *
 * Compares current repository state against indexed state
 * to determine which files need re-indexing.
 * Uses content hashing for reliable change detection beyond mtime.
 */

import type { ScannedFile, FileDiff, RepoFileRow } from './types.js';

/**
 * Compute a fast content hash for a file
 */
export async function computeFileHash(absolutePath: string): Promise<string> {
  const content = await Bun.file(absolutePath).arrayBuffer();
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(new Uint8Array(content));
  return hasher.digest('hex');
}

/**
 * Compare scanned files against indexed files to find changes.
 * Uses mtime as a fast first check, then content hash for accuracy.
 */
export async function computeDiff(
  scannedFiles: ScannedFile[],
  indexedFiles: Map<string, RepoFileRow>
): Promise<FileDiff> {
  const added: ScannedFile[] = [];
  const modified: ScannedFile[] = [];
  const deleted: string[] = [];

  // Track which indexed files we've seen
  const seenPaths = new Set<string>();

  for (const file of scannedFiles) {
    const indexed = indexedFiles.get(file.path);

    if (!indexed) {
      // New file, not in index
      added.push(file);
    } else if (file.mtime > indexed.mtime) {
      // mtime changed — verify with content hash if we have one stored
      if (indexed.hash) {
        const currentHash = await computeFileHash(file.absolutePath);
        if (currentHash !== indexed.hash) {
          modified.push(file);
        }
        // Same hash despite mtime change — skip (e.g., touch without edit)
      } else {
        // No stored hash — assume modified
        modified.push(file);
      }
    }
    // else: file unchanged, skip

    seenPaths.add(file.path);
  }

  // Find deleted files (in index but not in scan)
  for (const [path] of indexedFiles) {
    if (!seenPaths.has(path)) {
      deleted.push(path);
    }
  }

  return { added, modified, deleted };
}

/**
 * Get summary of diff for logging
 */
export function getDiffSummary(diff: FileDiff): string {
  const parts: string[] = [];

  if (diff.added.length > 0) {
    parts.push(`${diff.added.length} new`);
  }
  if (diff.modified.length > 0) {
    parts.push(`${diff.modified.length} modified`);
  }
  if (diff.deleted.length > 0) {
    parts.push(`${diff.deleted.length} deleted`);
  }

  if (parts.length === 0) {
    return 'No changes';
  }

  return parts.join(', ');
}

/**
 * Check if there are any changes to process
 */
export function hasChanges(diff: FileDiff): boolean {
  return diff.added.length > 0 || diff.modified.length > 0 || diff.deleted.length > 0;
}

/**
 * Get total number of files that need processing
 */
export function getChangedFileCount(diff: FileDiff): number {
  return diff.added.length + diff.modified.length + diff.deleted.length;
}
