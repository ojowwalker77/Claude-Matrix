/**
 * Add Action Handler
 *
 * Creates a new scheduled task.
 */

import type { DreamerInput } from '../../tools/validation.js';
import type { DreamerTask } from '../types.js';
import { createTask, deleteTask } from '../store.js';
import { getScheduler, isPlatformSupported } from '../scheduler/index.js';
import { parseSchedule, getNextRuns, cronToHuman } from '../cron/index.js';
import { getConfig } from '../../config/index.js';

export interface AddResult {
  success: boolean;
  task?: DreamerTask;
  schedule?: {
    expression: string;
    human: string;
    nextRuns: string[];
  };
  error?: string;
}

export async function handleAdd(input: DreamerInput): Promise<AddResult> {
  // Validate required fields
  if (!input.name) {
    return { success: false, error: 'Missing required field: name' };
  }
  if (!input.schedule) {
    return { success: false, error: 'Missing required field: schedule' };
  }
  if (!input.command) {
    return { success: false, error: 'Missing required field: command' };
  }

  // Check platform support
  if (!isPlatformSupported()) {
    return {
      success: false,
      error: `Dreamer is not supported on this platform. Supported: macOS (launchd), Linux (crontab).`,
    };
  }

  // Parse schedule (cron or natural language)
  const scheduleResult = parseSchedule(input.schedule);
  if (scheduleResult.error) {
    return { success: false, error: scheduleResult.error };
  }

  // Generate task ID
  const taskId = crypto.randomUUID();

  // Get config defaults
  const config = getConfig();
  const dreamerConfig = config.dreamer;

  // Build worktree config
  const worktreeEnabled = input.worktree?.enabled ?? false;

  // Create task object
  const task: Omit<DreamerTask, 'createdAt' | 'updatedAt'> = {
    id: taskId,
    name: input.name,
    description: input.description,
    enabled: true,
    cronExpression: scheduleResult.expression,
    timezone: input.timezone ?? 'local',
    command: input.command,
    workingDirectory: input.workingDirectory ?? process.cwd(),
    timeout: input.timeout ?? dreamerConfig.execution.defaultTimeout,
    env: input.env ?? {},
    skipPermissions: input.skipPermissions ?? dreamerConfig.execution.defaultSkipPermissions,
    worktreeEnabled,
    worktreeBasePath: input.worktree?.basePath ?? dreamerConfig.worktree.defaultBasePath,
    worktreeBranchPrefix: input.worktree?.branchPrefix ?? dreamerConfig.worktree.defaultBranchPrefix,
    worktreeRemote: input.worktree?.remoteName ?? dreamerConfig.worktree.defaultRemote,
    tags: input.tags ?? [],
    repoId: undefined,
  };

  // Save to database first
  let savedTask: DreamerTask;
  try {
    savedTask = createTask(task);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save task to database',
    };
  }

  // Register with native scheduler - rollback DB if this fails
  try {
    const scheduler = getScheduler();
    await scheduler.register(savedTask);
  } catch (error) {
    // Rollback: delete the task from database since scheduler registration failed
    deleteTask(taskId);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to register with scheduler',
    };
  }

  // Get next run times
  const nextRuns = getNextRuns(scheduleResult.expression, 3, task.timezone);

  return {
    success: true,
    task: savedTask,
    schedule: {
      expression: scheduleResult.expression,
      human: cronToHuman(scheduleResult.expression),
      nextRuns: nextRuns.map((d) => d.toISOString()),
    },
  };
}
