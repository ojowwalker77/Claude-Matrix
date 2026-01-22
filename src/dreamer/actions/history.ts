/**
 * History Action Handler
 *
 * Retrieves execution history for all tasks.
 */

import type { DreamerInput } from '../../tools/validation.js';
import type { ExecutionStatus } from '../types.js';
import { getAllExecutions } from '../store.js';
import { formatDuration, formatTimeAgo } from '../cron/index.js';

export interface HistoryEntry {
  id: string;
  taskId: string;
  taskName: string;
  status: ExecutionStatus;
  startedAt: string;
  startedAtHuman: string;
  completedAt?: string;
  duration?: number;
  durationHuman?: string;
  exitCode?: number;
  error?: string;
  triggeredBy: string;
  projectPath?: string;
  worktree?: {
    path?: string;
    branch?: string;
    pushed?: boolean;
  };
}

export interface HistoryResult {
  success: boolean;
  executions: HistoryEntry[];
  total: number;
  summary: {
    success: number;
    failure: number;
    timeout: number;
    running: number;
  };
}

export async function handleHistory(input: DreamerInput): Promise<HistoryResult> {
  const limit = input.limit ?? 50;
  const executions = getAllExecutions({ limit });

  const entries: HistoryEntry[] = [];
  const summary = {
    success: 0,
    failure: 0,
    timeout: 0,
    running: 0,
  };

  for (const exec of executions) {
    // Count by status
    if (exec.status === 'success') summary.success++;
    else if (exec.status === 'failure') summary.failure++;
    else if (exec.status === 'timeout') summary.timeout++;
    else if (exec.status === 'running') summary.running++;

    entries.push({
      id: exec.id,
      taskId: exec.taskId,
      taskName: exec.taskName,
      status: exec.status,
      startedAt: exec.startedAt,
      startedAtHuman: formatTimeAgo(new Date(exec.startedAt)),
      completedAt: exec.completedAt,
      duration: exec.duration,
      durationHuman: exec.duration ? formatDuration(exec.duration) : undefined,
      exitCode: exec.exitCode,
      error: exec.error,
      triggeredBy: exec.triggeredBy,
      projectPath: exec.projectPath,
      worktree:
        exec.worktreePath || exec.worktreeBranch
          ? {
              path: exec.worktreePath,
              branch: exec.worktreeBranch,
              pushed: exec.worktreePushed,
            }
          : undefined,
    });
  }

  return {
    success: true,
    executions: entries,
    total: entries.length,
    summary,
  };
}
