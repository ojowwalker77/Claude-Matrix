/**
 * Background Job Workers
 *
 * Worker functions for long-running operations.
 * These run asynchronously and update job status via the manager.
 */

import { updateJob } from './manager.js';
import { indexRepository } from '../indexer/index.js';
import { getRepoInfo } from '../tools/index-tools.js';
import { toolRegistry } from '../tools/registry.js';

export interface ReindexInput {
  full?: boolean;
  repoPath?: string;
}

/**
 * Run the reindex operation as a background job
 *
 * @param jobId - Job ID to update progress
 * @param input - Reindex options
 */
export async function runReindexJob(jobId: string, input: ReindexInput = {}): Promise<void> {
  try {
    // Mark as running
    updateJob(jobId, {
      status: 'running',
      progressPercent: 0,
      progressMessage: 'Starting reindex...',
    });

    // Detect repository
    const repo = getRepoInfo(input.repoPath);
    if (!repo.success) {
      updateJob(jobId, {
        status: 'failed',
        error: repo.message,
      });
      return;
    }

    updateJob(jobId, {
      progressPercent: 10,
      progressMessage: 'Repository detected, scanning files...',
    });

    // Run the actual indexing with progress callback
    const result = await indexRepository({
      repoRoot: repo.root,
      repoId: repo.id,
      incremental: !input.full,
      onProgress: (message, percent) => {
        // Scale progress from 10-90%
        const scaledPercent = 10 + Math.round(percent * 0.8);
        updateJob(jobId, {
          progressPercent: scaledPercent,
          progressMessage: message,
        });
      },
    });

    // Update tool registry
    toolRegistry.setIndexReady(true);

    // Mark as completed
    updateJob(jobId, {
      status: 'completed',
      progressPercent: 100,
      progressMessage: 'Indexing complete',
      result: {
        success: true,
        filesScanned: result.filesScanned,
        filesIndexed: result.filesIndexed,
        filesSkipped: result.filesSkipped,
        symbolsFound: result.symbolsFound,
        importsFound: result.importsFound,
        duration: result.duration,
        message:
          result.filesIndexed > 0
            ? `Indexed ${result.filesIndexed} files, found ${result.symbolsFound} symbols`
            : `Index up to date (${result.filesSkipped} files unchanged)`,
      },
    });
  } catch (err) {
    // Mark as failed
    toolRegistry.setIndexReady(false);
    updateJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Spawn a background job in a subprocess
 * This allows the MCP call to return immediately
 *
 * @param workerName - Name of the worker function
 * @param jobId - Job ID
 * @param input - Worker input
 */
export function spawnBackgroundJob(
  workerName: 'reindex',
  jobId: string,
  input: unknown
): void {
  // Use Bun.spawn to run the worker in background
  // The worker script handles the actual execution
  const workerScript = new URL('./worker-entry.ts', import.meta.url).pathname;

  Bun.spawn(['bun', 'run', workerScript, workerName, jobId, JSON.stringify(input)], {
    stdio: ['ignore', 'ignore', 'ignore'],
    // Detach from parent process
    detached: true,
  });
}
