/**
 * Background Job Manager
 *
 * Provides job tracking for long-running MCP operations.
 * Jobs are stored in SQLite and can be polled for status.
 *
 * Usage:
 *   const jobId = createJob('matrix_reindex');
 *   updateJob(jobId, { status: 'running', progress: 50 });
 *   const job = getJob(jobId);
 */

import { getDb } from '../db/index.js';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  toolName: string;
  status: JobStatus;
  progressPercent: number;
  progressMessage: string | null;
  input: unknown | null;
  result: unknown | null;
  error: string | null;
  pid: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface JobUpdate {
  status?: JobStatus;
  progressPercent?: number;
  progressMessage?: string;
  result?: unknown;
  error?: string;
}

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `job_${timestamp}_${random}`;
}

/**
 * Create a new background job
 *
 * @param toolName - Name of the MCP tool (e.g., 'matrix_reindex')
 * @param input - Optional input parameters to store
 * @returns Job ID
 */
export function createJob(toolName: string, input?: unknown): string {
  const db = getDb();
  const id = generateJobId();

  db.query(`
    INSERT INTO background_jobs (id, tool_name, status, input)
    VALUES (?, ?, 'queued', ?)
  `).run(id, toolName, input ? JSON.stringify(input) : null);

  return id;
}

/**
 * Get a job by ID
 *
 * @param jobId - Job ID to look up
 * @returns Job object or null if not found
 */
export function getJob(jobId: string): Job | null {
  const db = getDb();

  const row = db.query(`
    SELECT id, tool_name, status, progress_percent, progress_message,
           input, result, error, pid, created_at, started_at, completed_at
    FROM background_jobs
    WHERE id = ?
  `).get(jobId) as {
    id: string;
    tool_name: string;
    status: JobStatus;
    progress_percent: number;
    progress_message: string | null;
    input: string | null;
    result: string | null;
    error: string | null;
    pid: number | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
  } | null;

  if (!row) return null;

  return {
    id: row.id,
    toolName: row.tool_name,
    status: row.status,
    progressPercent: row.progress_percent,
    progressMessage: row.progress_message,
    input: row.input ? JSON.parse(row.input) : null,
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error,
    pid: row.pid,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

/**
 * Update a job's status and progress
 *
 * @param jobId - Job ID to update
 * @param updates - Fields to update
 */
export function updateJob(jobId: string, updates: JobUpdate): void {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);

    // Auto-set timestamps based on status
    if (updates.status === 'running') {
      sets.push("started_at = datetime('now')");
    } else if (['completed', 'failed', 'cancelled'].includes(updates.status)) {
      sets.push("completed_at = datetime('now')");
    }
  }

  if (updates.progressPercent !== undefined) {
    sets.push('progress_percent = ?');
    values.push(updates.progressPercent);
  }

  if (updates.progressMessage !== undefined) {
    sets.push('progress_message = ?');
    values.push(updates.progressMessage);
  }

  if (updates.result !== undefined) {
    sets.push('result = ?');
    values.push(JSON.stringify(updates.result));
  }

  if (updates.error !== undefined) {
    sets.push('error = ?');
    values.push(updates.error);
  }

  if (sets.length === 0) return;

  values.push(jobId);
  db.query(`UPDATE background_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * Cancel a job if it's still running or queued
 *
 * @param jobId - Job ID to cancel
 * @returns true if job was cancelled, false if already completed/failed
 */
export function cancelJob(jobId: string): boolean {
  const db = getDb();

  const result = db.query(`
    UPDATE background_jobs
    SET status = 'cancelled', completed_at = datetime('now')
    WHERE id = ? AND status IN ('queued', 'running')
  `).run(jobId);

  return result.changes > 0;
}

/**
 * List jobs by status
 *
 * @param status - Filter by status (optional)
 * @param limit - Max number of jobs to return
 * @returns Array of jobs
 */
export function listJobs(status?: JobStatus, limit = 50): Job[] {
  const db = getDb();

  let query = `
    SELECT id, tool_name, status, progress_percent, progress_message,
           input, result, error, pid, created_at, started_at, completed_at
    FROM background_jobs
  `;

  const params: (string | number)[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.query(query).all(...params) as Array<{
    id: string;
    tool_name: string;
    status: JobStatus;
    progress_percent: number;
    progress_message: string | null;
    input: string | null;
    result: string | null;
    error: string | null;
    pid: number | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
  }>;

  return rows.map(row => ({
    id: row.id,
    toolName: row.tool_name,
    status: row.status,
    progressPercent: row.progress_percent,
    progressMessage: row.progress_message,
    input: row.input ? JSON.parse(row.input) : null,
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error,
    pid: row.pid,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }));
}

/**
 * Clean up old completed jobs (older than 24 hours)
 */
export function cleanupOldJobs(): number {
  const db = getDb();

  const result = db.query(`
    DELETE FROM background_jobs
    WHERE status IN ('completed', 'failed', 'cancelled')
      AND completed_at < datetime('now', '-24 hours')
  `).run();

  return result.changes;
}

/**
 * Update a job's PID after spawning
 *
 * @param jobId - Job ID to update
 * @param pid - Process ID of the spawned worker
 */
export function updateJobPid(jobId: string, pid: number): void {
  const db = getDb();
  db.query('UPDATE background_jobs SET pid = ? WHERE id = ?').run(pid, jobId);
}

/**
 * Clean up orphaned processes from previous sessions
 *
 * Checks if running/queued jobs have live processes. If the process
 * doesn't exist, marks the job as failed. This should be called on startup.
 *
 * @returns Number of orphaned jobs cleaned up
 */
export function cleanupOrphanedProcesses(): number {
  const db = getDb();

  const running = db
    .query(
      `
    SELECT id, pid FROM background_jobs
    WHERE status IN ('queued', 'running') AND pid IS NOT NULL
  `
    )
    .all() as { id: string; pid: number }[];

  let cleaned = 0;
  for (const job of running) {
    try {
      // Signal 0 checks if process exists without killing it
      process.kill(job.pid, 0);
    } catch {
      // Process doesn't exist - mark as failed
      updateJob(job.id, {
        status: 'failed',
        error: 'Process terminated unexpectedly (orphaned)',
      });
      cleaned++;
    }
  }

  return cleaned;
}
