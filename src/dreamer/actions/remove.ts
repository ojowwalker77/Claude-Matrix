/**
 * Remove Action Handler
 *
 * Removes a scheduled task.
 */

import type { DreamerInput } from '../../tools/validation.js';
import { getTask, deleteTask } from '../store.js';
import { getScheduler, isPlatformSupported } from '../scheduler/index.js';

export interface RemoveResult {
  success: boolean;
  taskId?: string;
  taskName?: string;
  error?: string;
}

export async function handleRemove(input: DreamerInput): Promise<RemoveResult> {
  if (!input.taskId) {
    return { success: false, error: 'Missing required field: taskId' };
  }

  const task = getTask(input.taskId);
  if (!task) {
    return { success: false, error: `Task not found: ${input.taskId}` };
  }

  try {
    // Unregister from native scheduler
    if (isPlatformSupported()) {
      const scheduler = getScheduler();
      await scheduler.unregister(task.id);
    }

    // Delete from database
    deleteTask(task.id);

    return {
      success: true,
      taskId: task.id,
      taskName: task.name,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove task',
    };
  }
}
