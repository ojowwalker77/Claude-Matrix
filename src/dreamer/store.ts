/**
 * Dreamer Database Store
 *
 * Handles all database operations for scheduled tasks and execution records.
 */

import { getDb } from '../db/index.js';
import type {
  DreamerTask,
  DreamerTaskRow,
  DreamerExecution,
  DreamerExecutionRow,
  ExecutionStatus,
} from './types.js';
import { rowToTask, rowToExecution } from './types.js';

// ============================================================================
// Task Operations
// ============================================================================

/**
 * Create a new scheduled task
 */
export function createTask(task: Omit<DreamerTask, 'createdAt' | 'updatedAt'>): DreamerTask {
  const db = getDb();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO dreamer_tasks (
      id, name, description, enabled, cron_expression, timezone,
      command, working_directory, timeout, env, skip_permissions,
      worktree_enabled, worktree_base_path, worktree_branch_prefix, worktree_remote,
      tags, repo_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.name,
      task.description ?? null,
      task.enabled ? 1 : 0,
      task.cronExpression,
      task.timezone,
      task.command,
      task.workingDirectory,
      task.timeout,
      JSON.stringify(task.env || {}),
      task.skipPermissions ? 1 : 0,
      task.worktreeEnabled ? 1 : 0,
      task.worktreeBasePath ?? null,
      task.worktreeBranchPrefix,
      task.worktreeRemote,
      JSON.stringify(task.tags || []),
      task.repoId ?? null,
      now,
      now,
    ]
  );

  return {
    ...task,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get a task by ID
 */
export function getTask(taskId: string): DreamerTask | null {
  const db = getDb();
  const row = db.query<DreamerTaskRow, [string]>(
    'SELECT * FROM dreamer_tasks WHERE id = ?'
  ).get(taskId);

  return row ? rowToTask(row) : null;
}

/**
 * Get all tasks
 */
type SQLQueryBindings = string | number | boolean | null | Uint8Array;

export function getAllTasks(options?: {
  enabledOnly?: boolean;
  repoId?: string;
  tag?: string;
  limit?: number;
}): DreamerTask[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLQueryBindings[] = [];

  if (options?.enabledOnly) {
    conditions.push('enabled = 1');
  }

  if (options?.repoId) {
    conditions.push('repo_id = ?');
    params.push(options.repoId);
  }

  if (options?.tag) {
    // JSON array contains tag - escape LIKE wildcards to prevent injection
    const escapedTag = options.tag.replace(/%/g, '\\%').replace(/_/g, '\\_');
    conditions.push("tags LIKE ? ESCAPE '\\'");
    params.push(`%"${escapedTag}"%`);
  }

  let sql = 'SELECT * FROM dreamer_tasks';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.query<DreamerTaskRow, SQLQueryBindings[]>(sql).all(...params);
  return rows.map(rowToTask);
}

/**
 * Update a task
 */
export function updateTask(
  taskId: string,
  updates: Partial<Omit<DreamerTask, 'id' | 'createdAt' | 'updatedAt'>>
): DreamerTask | null {
  const db = getDb();
  const task = getTask(taskId);
  if (!task) return null;

  const now = new Date().toISOString();
  const fields: string[] = [];
  const params: SQLQueryBindings[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    params.push(updates.description);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }
  if (updates.cronExpression !== undefined) {
    fields.push('cron_expression = ?');
    params.push(updates.cronExpression);
  }
  if (updates.timezone !== undefined) {
    fields.push('timezone = ?');
    params.push(updates.timezone);
  }
  if (updates.command !== undefined) {
    fields.push('command = ?');
    params.push(updates.command);
  }
  if (updates.workingDirectory !== undefined) {
    fields.push('working_directory = ?');
    params.push(updates.workingDirectory);
  }
  if (updates.timeout !== undefined) {
    fields.push('timeout = ?');
    params.push(updates.timeout);
  }
  if (updates.env !== undefined) {
    fields.push('env = ?');
    params.push(JSON.stringify(updates.env));
  }
  if (updates.skipPermissions !== undefined) {
    fields.push('skip_permissions = ?');
    params.push(updates.skipPermissions ? 1 : 0);
  }
  if (updates.worktreeEnabled !== undefined) {
    fields.push('worktree_enabled = ?');
    params.push(updates.worktreeEnabled ? 1 : 0);
  }
  if (updates.worktreeBasePath !== undefined) {
    fields.push('worktree_base_path = ?');
    params.push(updates.worktreeBasePath);
  }
  if (updates.worktreeBranchPrefix !== undefined) {
    fields.push('worktree_branch_prefix = ?');
    params.push(updates.worktreeBranchPrefix);
  }
  if (updates.worktreeRemote !== undefined) {
    fields.push('worktree_remote = ?');
    params.push(updates.worktreeRemote);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    params.push(JSON.stringify(updates.tags));
  }
  if (updates.repoId !== undefined) {
    fields.push('repo_id = ?');
    params.push(updates.repoId);
  }

  if (fields.length === 0) {
    return task;
  }

  fields.push('updated_at = ?');
  params.push(now);
  params.push(taskId);

  db.run(
    `UPDATE dreamer_tasks SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return getTask(taskId);
}

/**
 * Delete a task
 */
export function deleteTask(taskId: string): boolean {
  const db = getDb();
  const result = db.run('DELETE FROM dreamer_tasks WHERE id = ?', [taskId]);
  return result.changes > 0;
}

// ============================================================================
// Execution Operations
// ============================================================================

/**
 * Create an execution record
 */
export function createExecution(execution: Omit<DreamerExecution, 'id'>): DreamerExecution {
  const db = getDb();
  const id = crypto.randomUUID();

  db.run(
    `INSERT INTO dreamer_executions (
      id, task_id, started_at, completed_at, status, triggered_by,
      duration, exit_code, output_preview, error, task_name,
      project_path, cron_expression, worktree_path, worktree_branch, worktree_pushed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      execution.taskId,
      execution.startedAt,
      execution.completedAt ?? null,
      execution.status,
      execution.triggeredBy,
      execution.duration ?? null,
      execution.exitCode ?? null,
      execution.outputPreview ?? null,
      execution.error ?? null,
      execution.taskName,
      execution.projectPath ?? null,
      execution.cronExpression ?? null,
      execution.worktreePath ?? null,
      execution.worktreeBranch ?? null,
      execution.worktreePushed !== undefined ? (execution.worktreePushed ? 1 : 0) : null,
    ]
  );

  return { id, ...execution };
}

/**
 * Update an execution record
 */
export function updateExecution(
  executionId: string,
  updates: Partial<Pick<DreamerExecution, 'completedAt' | 'status' | 'duration' | 'exitCode' | 'outputPreview' | 'error' | 'worktreePath' | 'worktreeBranch' | 'worktreePushed'>>
): void {
  const db = getDb();
  const fields: string[] = [];
  const params: SQLQueryBindings[] = [];

  if (updates.completedAt !== undefined) {
    fields.push('completed_at = ?');
    params.push(updates.completedAt);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    params.push(updates.status);
  }
  if (updates.duration !== undefined) {
    fields.push('duration = ?');
    params.push(updates.duration);
  }
  if (updates.exitCode !== undefined) {
    fields.push('exit_code = ?');
    params.push(updates.exitCode);
  }
  if (updates.outputPreview !== undefined) {
    fields.push('output_preview = ?');
    params.push(updates.outputPreview);
  }
  if (updates.error !== undefined) {
    fields.push('error = ?');
    params.push(updates.error);
  }
  if (updates.worktreePath !== undefined) {
    fields.push('worktree_path = ?');
    params.push(updates.worktreePath);
  }
  if (updates.worktreeBranch !== undefined) {
    fields.push('worktree_branch = ?');
    params.push(updates.worktreeBranch);
  }
  if (updates.worktreePushed !== undefined) {
    fields.push('worktree_pushed = ?');
    params.push(updates.worktreePushed ? 1 : 0);
  }

  if (fields.length > 0) {
    params.push(executionId);
    db.run(
      `UPDATE dreamer_executions SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
  }
}

/**
 * Get executions for a task
 */
export function getExecutions(taskId: string, limit?: number): DreamerExecution[] {
  const db = getDb();
  let sql = 'SELECT * FROM dreamer_executions WHERE task_id = ? ORDER BY started_at DESC';
  const params: SQLQueryBindings[] = [taskId];

  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  const rows = db.query<DreamerExecutionRow, SQLQueryBindings[]>(sql).all(...params);
  return rows.map(rowToExecution);
}

/**
 * Get all executions (history)
 */
export function getAllExecutions(options?: {
  status?: ExecutionStatus;
  limit?: number;
}): DreamerExecution[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: SQLQueryBindings[] = [];

  if (options?.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }

  let sql = 'SELECT * FROM dreamer_executions';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY started_at DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.query<DreamerExecutionRow, SQLQueryBindings[]>(sql).all(...params);
  return rows.map(rowToExecution);
}

/**
 * Get latest execution for a task
 */
export function getLatestExecution(taskId: string): DreamerExecution | null {
  const executions = getExecutions(taskId, 1);
  return executions[0] ?? null;
}

/**
 * Count executions by status for a task
 */
export function countExecutionsByStatus(taskId: string): Record<ExecutionStatus, number> {
  const db = getDb();
  const rows = db.query<{ status: string; count: number }, [string]>(
    `SELECT status, COUNT(*) as count FROM dreamer_executions WHERE task_id = ? GROUP BY status`
  ).all(taskId);

  const counts: Record<ExecutionStatus, number> = {
    running: 0,
    success: 0,
    failure: 0,
    timeout: 0,
    skipped: 0,
  };

  for (const row of rows) {
    counts[row.status as ExecutionStatus] = row.count;
  }

  return counts;
}
