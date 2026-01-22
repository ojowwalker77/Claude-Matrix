/**
 * Run Action Handler
 *
 * Manually triggers a task execution.
 */

import { spawn } from 'child_process';
import type { DreamerInput } from '../../tools/validation.js';
import { getTask, createExecution, updateExecution } from '../store.js';
import { shellEscape } from '../scheduler/index.js';

// Cap output buffer to prevent memory exhaustion on verbose tasks
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB limit

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

  // Build the command
  const escapedCommand = shellEscape(task.command);
  const flags: string[] = [];
  if (task.skipPermissions) {
    flags.push('--dangerously-skip-permissions');
  }
  const flagStr = flags.length > 0 ? ` ${flags.join(' ')}` : '';
  const fullCommand = `cd ${shellEscape(task.workingDirectory)} && claude -p ${escapedCommand}${flagStr}`;

  // Execute with timeout using spawn for proper cleanup
  const timeoutMs = (task.timeout || 300) * 1000;

  return new Promise<RunResult>((resolve) => {
    const proc = spawn('sh', ['-c', fullCommand], {
      env: { ...process.env, ...task.env },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Set up timeout to kill process
    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, timeoutMs);

    // Collect output with size cap to prevent memory exhaustion
    proc.stdout.on('data', (data) => {
      if (stdout.length < MAX_OUTPUT_SIZE) {
        stdout += data.toString().slice(0, MAX_OUTPUT_SIZE - stdout.length);
      }
    });

    proc.stderr.on('data', (data) => {
      if (stderr.length < MAX_OUTPUT_SIZE) {
        stderr += data.toString().slice(0, MAX_OUTPUT_SIZE - stderr.length);
      }
    });

    // Handle process completion
    proc.on('close', (code) => {
      // Always cleanup
      clearTimeout(timeoutId);
      try {
        proc.stdout.destroy();
      } catch {
        /* already destroyed */
      }
      try {
        proc.stderr.destroy();
      } catch {
        /* already destroyed */
      }

      const duration = Date.now() - startTime;
      const output = stdout || stderr;
      const outputPreview = output.length > 500 ? output.slice(0, 500) + '...' : output;

      if (killed) {
        // Timeout case
        updateExecution(execution.id, {
          completedAt: new Date().toISOString(),
          status: 'timeout',
          duration,
          error: `Task timed out after ${task.timeout}s`,
          outputPreview: stderr.slice(0, 500) || undefined,
        });

        resolve({
          success: false,
          executionId: execution.id,
          status: 'timeout',
          duration,
          error: `Task timed out after ${task.timeout}s`,
        });
      } else if (code === 0) {
        // Success case
        updateExecution(execution.id, {
          completedAt: new Date().toISOString(),
          status: 'success',
          duration,
          exitCode: 0,
          outputPreview,
        });

        resolve({
          success: true,
          executionId: execution.id,
          status: 'success',
          exitCode: 0,
          duration,
          outputPreview,
        });
      } else {
        // Failure case
        updateExecution(execution.id, {
          completedAt: new Date().toISOString(),
          status: 'failure',
          duration,
          exitCode: code ?? undefined,
          error: stderr || `Process exited with code ${code}`,
          outputPreview: stderr.slice(0, 500) || undefined,
        });

        resolve({
          success: false,
          executionId: execution.id,
          status: 'failure',
          exitCode: code ?? undefined,
          duration,
          error: stderr || `Process exited with code ${code}`,
        });
      }
    });

    // Handle spawn errors
    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      try {
        proc.stdout.destroy();
      } catch {
        /* already destroyed */
      }
      try {
        proc.stderr.destroy();
      } catch {
        /* already destroyed */
      }

      const duration = Date.now() - startTime;

      updateExecution(execution.id, {
        completedAt: new Date().toISOString(),
        status: 'failure',
        duration,
        error: err.message,
      });

      resolve({
        success: false,
        executionId: execution.id,
        status: 'failure',
        duration,
        error: err.message,
      });
    });
  });
}
