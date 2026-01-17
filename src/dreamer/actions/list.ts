/**
 * List Action Handler
 *
 * Lists all scheduled tasks.
 */

import type { DreamerInput } from '../../tools/validation.js';
import type { DreamerTask } from '../types.js';
import { getAllTasks, getLatestExecution, countExecutionsByStatus } from '../store.js';
import { cronToHuman, getNextRun, formatTimeUntil } from '../cron/index.js';

export interface TaskSummary {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  scheduleHuman: string;
  nextRun?: string;
  nextRunHuman?: string;
  lastRun?: {
    status: string;
    startedAt: string;
    duration?: number;
  };
  stats: {
    success: number;
    failure: number;
    total: number;
  };
  tags: string[];
  workingDirectory: string;
  worktreeEnabled: boolean;
}

export interface ListResult {
  success: boolean;
  tasks: TaskSummary[];
  total: number;
}

export async function handleList(input: DreamerInput): Promise<ListResult> {
  const tasks = getAllTasks({
    tag: input.tag,
    limit: input.limit,
  });

  const summaries: TaskSummary[] = [];

  for (const task of tasks) {
    const lastExecution = getLatestExecution(task.id);
    const executionStats = countExecutionsByStatus(task.id);
    const nextRun = task.enabled ? getNextRun(task.cronExpression, task.timezone) : null;

    summaries.push({
      id: task.id,
      name: task.name,
      enabled: task.enabled,
      schedule: task.cronExpression,
      scheduleHuman: cronToHuman(task.cronExpression),
      nextRun: nextRun?.toISOString(),
      nextRunHuman: nextRun ? formatTimeUntil(nextRun) : undefined,
      lastRun: lastExecution
        ? {
            status: lastExecution.status,
            startedAt: lastExecution.startedAt,
            duration: lastExecution.duration,
          }
        : undefined,
      stats: {
        success: executionStats.success,
        failure: executionStats.failure,
        total:
          executionStats.success +
          executionStats.failure +
          executionStats.timeout +
          executionStats.skipped,
      },
      tags: task.tags,
      workingDirectory: task.workingDirectory,
      worktreeEnabled: task.worktreeEnabled,
    });
  }

  return {
    success: true,
    tasks: summaries,
    total: summaries.length,
  };
}
