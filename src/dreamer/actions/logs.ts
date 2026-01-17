/**
 * Logs Action Handler
 *
 * Retrieves logs for a scheduled task.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { DreamerInput } from '../../tools/validation.js';
import { getTask } from '../store.js';

/**
 * Get the logs directory for Dreamer
 */
function getLogsDir(): string {
  return join(homedir(), '.claude', 'matrix', 'dreamer', 'logs');
}

export interface LogsResult {
  success: boolean;
  taskId?: string;
  taskName?: string;
  logs?: {
    stdout?: string;
    stderr?: string;
    combined?: string;
  };
  paths?: {
    stdout: string;
    stderr: string;
  };
  error?: string;
}

export async function handleLogs(input: DreamerInput): Promise<LogsResult> {
  if (!input.taskId) {
    return { success: false, error: 'Missing required field: taskId' };
  }

  const task = getTask(input.taskId);
  if (!task) {
    return { success: false, error: `Task not found: ${input.taskId}` };
  }

  const logDir = getLogsDir();
  const stdoutPath = join(logDir, `${task.id}.out.log`);
  const stderrPath = join(logDir, `${task.id}.err.log`);
  // For Linux crontab, logs go to a single file
  const combinedPath = join(logDir, `${task.id}.log`);

  const lines = input.lines ?? 50;
  const stream = input.stream ?? 'both';

  const result: LogsResult = {
    success: true,
    taskId: task.id,
    taskName: task.name,
    paths: {
      stdout: stdoutPath,
      stderr: stderrPath,
    },
    logs: {},
  };

  // Helper to read last N lines
  const readLastLines = (filePath: string, n: number): string | undefined => {
    if (!existsSync(filePath)) {
      return undefined;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const allLines = content.split('\n');
      const lastLines = allLines.slice(-n).join('\n');
      return lastLines || '(empty)';
    } catch {
      return undefined;
    }
  };

  // Read requested streams
  if (stream === 'stdout' || stream === 'both') {
    result.logs!.stdout = readLastLines(stdoutPath, lines);
  }

  if (stream === 'stderr' || stream === 'both') {
    result.logs!.stderr = readLastLines(stderrPath, lines);
  }

  // Also check combined log (for Linux)
  if (stream === 'both') {
    result.logs!.combined = readLastLines(combinedPath, lines);
  }

  // Check if any logs were found
  const hasLogs = result.logs!.stdout || result.logs!.stderr || result.logs!.combined;
  if (!hasLogs) {
    result.logs = undefined;
    result.error = 'No logs found. Task may not have executed yet.';
  }

  return result;
}
