/**
 * Run Action Handler
 *
 * Manually triggers a task execution.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { DreamerInput } from '../../tools/validation.js';
import { getTask, createExecution, updateExecution } from '../store.js';
import { shellEscape } from '../scheduler/index.js';

const execAsync = promisify(exec);

export interface RunResult {
  success: boolean;
  executionId?: string;
  status?: 'success' | 'failure' | 'timeout';
  exitCode?: number;
  duration?: number;
  outputPreview?: string;
  error?: string;
}

export async function handleRun(input: DreamerInput): Promise<RunResult> {
  if (!input.taskId) {
    return { success: false, error: 'Missing required field: taskId' };
  }

  const task = getTask(input.taskId);
  if (!task) {
    return { success: false, error: `Task not found: ${input.taskId}` };
  }

  // Create execution record
  const startTime = Date.now();
  const execution = createExecution({
    taskId: task.id,
    startedAt: new Date().toISOString(),
    status: 'running',
    triggeredBy: 'manual',
    taskName: task.name,
    projectPath: task.workingDirectory,
    cronExpression: task.cronExpression,
  });

  try {
    // Build the command
    const escapedCommand = shellEscape(task.command);
    const flags: string[] = [];
    if (task.skipPermissions) {
      flags.push('--dangerously-skip-permissions');
    }
    const flagStr = flags.length > 0 ? ` ${flags.join(' ')}` : '';
    const fullCommand = `cd ${shellEscape(task.workingDirectory)} && claude -p ${escapedCommand}${flagStr}`;

    // Execute with timeout
    const timeoutMs = (task.timeout || 300) * 1000;
    const { stdout, stderr } = await execAsync(fullCommand, {
      timeout: timeoutMs,
      env: { ...process.env, ...task.env },
    });

    const duration = Date.now() - startTime;
    const output = stdout || stderr;
    const outputPreview = output.length > 500 ? output.slice(0, 500) + '...' : output;

    // Update execution record
    updateExecution(execution.id, {
      completedAt: new Date().toISOString(),
      status: 'success',
      duration,
      exitCode: 0,
      outputPreview,
    });

    return {
      success: true,
      executionId: execution.id,
      status: 'success',
      exitCode: 0,
      duration,
      outputPreview,
    };
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const err = error as { code?: string; killed?: boolean; stderr?: string; message?: string };

    let status: 'failure' | 'timeout' = 'failure';
    let errorMessage = err.message || 'Unknown error';
    let exitCode: number | undefined;

    if (err.killed || err.code === 'ETIMEDOUT') {
      status = 'timeout';
      errorMessage = `Task timed out after ${task.timeout}s`;
    } else if (typeof (error as { code?: number }).code === 'number') {
      exitCode = (error as { code: number }).code;
    }

    // Update execution record
    updateExecution(execution.id, {
      completedAt: new Date().toISOString(),
      status,
      duration,
      exitCode,
      error: errorMessage,
      outputPreview: err.stderr?.slice(0, 500),
    });

    return {
      success: false,
      executionId: execution.id,
      status,
      exitCode,
      duration,
      error: errorMessage,
    };
  }
}
