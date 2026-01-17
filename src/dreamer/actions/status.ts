/**
 * Status Action Handler
 *
 * Gets the status of the Dreamer scheduler system.
 */

import type { DreamerInput } from '../../tools/validation.js';
import { getAllTasks, getAllExecutions } from '../store.js';
import {
  getScheduler,
  isPlatformSupported,
  getPlatformName,
  getSchedulerName,
} from '../scheduler/index.js';

export interface StatusResult {
  success: boolean;
  platform: {
    name: string;
    supported: boolean;
    scheduler?: string;
  };
  scheduler?: {
    healthy: boolean;
    registeredCount: number;
    errors: string[];
  };
  tasks: {
    total: number;
    enabled: number;
    disabled: number;
  };
  executions: {
    total: number;
    running: number;
    recent: {
      success: number;
      failure: number;
      timeout: number;
    };
  };
  error?: string;
}

export async function handleStatus(_input: DreamerInput): Promise<StatusResult> {
  const supported = isPlatformSupported();

  // Get task counts
  const allTasks = getAllTasks();
  const enabledTasks = allTasks.filter((t) => t.enabled);

  // Get recent executions (last 100)
  const recentExecutions = getAllExecutions({ limit: 100 });
  const runningExecutions = recentExecutions.filter((e) => e.status === 'running');
  const successExecutions = recentExecutions.filter((e) => e.status === 'success');
  const failureExecutions = recentExecutions.filter((e) => e.status === 'failure');
  const timeoutExecutions = recentExecutions.filter((e) => e.status === 'timeout');

  const result: StatusResult = {
    success: true,
    platform: {
      name: getPlatformName(),
      supported,
      scheduler: supported ? getSchedulerName() : undefined,
    },
    tasks: {
      total: allTasks.length,
      enabled: enabledTasks.length,
      disabled: allTasks.length - enabledTasks.length,
    },
    executions: {
      total: recentExecutions.length,
      running: runningExecutions.length,
      recent: {
        success: successExecutions.length,
        failure: failureExecutions.length,
        timeout: timeoutExecutions.length,
      },
    },
  };

  // Get native scheduler status if supported
  if (supported) {
    try {
      const scheduler = getScheduler();
      const status = await scheduler.getStatus();
      result.scheduler = {
        healthy: status.healthy,
        registeredCount: status.taskCount,
        errors: status.errors,
      };
    } catch (error) {
      result.scheduler = {
        healthy: false,
        registeredCount: 0,
        errors: [error instanceof Error ? error.message : 'Failed to get scheduler status'],
      };
    }
  }

  return result;
}
