/**
 * Claude Dreamer - Scheduled Task Automation
 *
 * Unified entry point for the matrix_dreamer MCP tool.
 * Dispatches actions to appropriate handlers.
 */

import type { DreamerInput } from '../tools/validation.js';
import {
  handleAdd,
  handleList,
  handleRun,
  handleRemove,
  handleStatus,
  handleLogs,
  handleHistory,
  type AddResult,
  type ListResult,
  type RunResult,
  type RemoveResult,
  type StatusResult,
  type LogsResult,
  type HistoryResult,
} from './actions/index.js';

// Re-export types
export type {
  DreamerTask,
  DreamerExecution,
  ExecutionStatus,
  SchedulerStatus,
} from './types.js';

export type {
  AddResult,
  ListResult,
  RunResult,
  RemoveResult,
  StatusResult,
  LogsResult,
  HistoryResult,
};

// Union of all possible results
export type DreamerResult =
  | AddResult
  | ListResult
  | RunResult
  | RemoveResult
  | StatusResult
  | LogsResult
  | HistoryResult;

/**
 * Main handler for the matrix_dreamer tool.
 * Dispatches to the appropriate action handler based on input.action.
 */
export async function matrixDreamer(input: DreamerInput): Promise<DreamerResult> {
  switch (input.action) {
    case 'add':
      return handleAdd(input);

    case 'list':
      return handleList(input);

    case 'run':
      return handleRun(input);

    case 'remove':
      return handleRemove(input);

    case 'status':
      return handleStatus(input);

    case 'logs':
      return handleLogs(input);

    case 'history':
      return handleHistory(input);

    default:
      return {
        success: false,
        error: `Unknown action: ${(input as { action: string }).action}`,
      } as RunResult;
  }
}

// Re-export utilities for external use
export {
  getScheduler,
  isPlatformSupported,
  getPlatformName,
  getSchedulerName,
} from './scheduler/index.js';

export {
  validateCron,
  parseSchedule,
  cronToHuman,
  getNextRuns,
  getNextRun,
} from './cron/index.js';
