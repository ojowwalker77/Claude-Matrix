/**
 * Background Job Workers
 *
 * Worker functions for long-running operations.
 * These run asynchronously and update job status via the manager.
 */

import { updateJob, updateJobPid, getJob } from './manager.js';
import { indexRepository } from '../indexer/index.js';
import { getRepoInfo } from '../tools/index-tools.js';
import { toolRegistry } from '../tools/registry.js';

// Track setTimeout handles for orphan cleanup
const jobTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Clear timeout for a specific job (call on terminal states)
 */
export function clearJobTimeout(jobId: string): boolean {
  const timeout = jobTimeouts.get(jobId);
  if (timeout) {
    clearTimeout(timeout);
    jobTimeouts.delete(jobId);
    return true;
  }
  return false;
}

/**
 * Clear all job timeouts (call on shutdown)
 */
export function clearAllJobTimeouts(): number {
  let cleared = 0;
  for (const [jobId, timeout] of jobTimeouts) {
    clearTimeout(timeout);
    jobTimeouts.delete(jobId);
    cleared++;
  }
  return cleared;
}

// Expose map for testing only
export const _jobTimeoutsForTesting = jobTimeouts;

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

// Maximum time a background job can run before being killed (30 minutes)
const MAX_JOB_TIMEOUT_MS = 30 * 60 * 1000;

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

  const proc = Bun.spawn(['bun', 'run', workerScript, workerName, jobId, JSON.stringify(input)], {
    stdio: ['ignore', 'ignore', 'ignore'],
    // Detach from parent process
    detached: true,
  });

  // Store PID for orphan cleanup tracking
  // Extract pid to primitive to avoid holding proc object in closure for 30 min
  const pid = proc.pid;
  if (pid) {
    updateJobPid(jobId, pid);

    // Add timeout monitoring to prevent zombie processes
    // This runs in the parent process and will kill the worker if it exceeds max time
    const timeoutId = setTimeout(() => {
      // Cleanup from map first (timeout fired = no longer needed)
      jobTimeouts.delete(jobId);

      const job = getJob(jobId);
      if (job && (job.status === 'running' || job.status === 'queued')) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Process already dead
        }
        updateJob(jobId, {
          status: 'failed',
          error: `Job timed out after ${MAX_JOB_TIMEOUT_MS / 60000} minutes`,
        });
      }
    }, MAX_JOB_TIMEOUT_MS);

    // Store timeout handle for orphan cleanup
    jobTimeouts.set(jobId, timeoutId);
  }
}
