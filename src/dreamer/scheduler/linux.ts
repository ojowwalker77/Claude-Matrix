/**
 * Linux Scheduler - crontab Implementation
 *
 * Manages scheduled tasks using the system crontab.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { BaseScheduler, SchedulerError } from './base.js';
import { shellEscape } from './shell.js';
import type { DreamerTask, SchedulerStatus } from '../types.js';

const execAsync = promisify(exec);

/**
 * Get the logs directory for Dreamer
 */
function getLogsDir(): string {
  const dir = join(homedir(), '.claude', 'matrix', 'dreamer', 'logs');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Linux crontab scheduler implementation
 */
export class LinuxScheduler extends BaseScheduler {
  readonly name = 'crontab';
  readonly platform = 'linux' as const;

  /**
   * Marker comment to identify our cron entries
   */
  private readonly MARKER_PREFIX = '# claude-dreamer:';

  /**
   * Get the path for a worktree script
   */
  private getWorktreeScriptPath(taskId: string): string {
    return join(getLogsDir(), `${taskId}.worktree.sh`);
  }

  async register(task: DreamerTask): Promise<void> {
    try {
      const logDir = getLogsDir();
      const logPath = `${logDir}/${task.id}.log`;

      // Ensure logs directory exists
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      // Determine the command to run
      let cronCommand: string;

      if (this.usesWorktree(task)) {
        // Generate and write worktree script
        const script = this.generateWorktreeScript(task, logDir);
        if (script) {
          const scriptPath = this.getWorktreeScriptPath(task.id);
          writeFileSync(scriptPath, script, { mode: 0o755 });
          // Shell escape the script path for safe execution
          cronCommand = `bash ${shellEscape(scriptPath)}`;
        } else {
          // Fallback to direct execution with shell-escaped workDir
          const command = this.getExecutionCommand(task);
          const workDir = this.getWorkingDirectory(task);
          cronCommand = `cd ${shellEscape(workDir)} && ${command}`;
        }
      } else {
        // Direct execution with shell-escaped workDir
        const command = this.getExecutionCommand(task);
        const workDir = this.getWorkingDirectory(task);
        cronCommand = `cd ${shellEscape(workDir)} && ${command}`;
      }

      // Get current crontab
      const currentCrontab = await this.getCurrentCrontab();

      // Remove existing entry for this task
      const lines = currentCrontab
        .split('\n')
        .filter((line) => !line.includes(`${this.MARKER_PREFIX}${task.id}`));

      // Add new entry - use shellEscape for log path to prevent injection
      const logPathEsc = shellEscape(logPath);
      const cronLine = `${task.cronExpression} ${cronCommand} >> ${logPathEsc} 2>&1 ${this.MARKER_PREFIX}${task.id}`;
      lines.push(cronLine);

      // Update crontab
      const newCrontab = lines.filter((l) => l.trim()).join('\n') + '\n';
      await this.setCrontab(newCrontab);
    } catch (error) {
      throw new SchedulerError(
        `Failed to register task "${task.name}" with crontab`,
        this.platform,
        'register',
        error as Error
      );
    }
  }

  async unregister(taskId: string): Promise<void> {
    try {
      const currentCrontab = await this.getCurrentCrontab();

      // Remove entry for this task
      const lines = currentCrontab
        .split('\n')
        .filter((line) => !line.includes(`${this.MARKER_PREFIX}${taskId}`));

      // Update crontab
      const newCrontab = lines.filter((l) => l.trim()).join('\n') + '\n';
      await this.setCrontab(newCrontab);

      // Remove worktree script if exists
      const scriptPath = this.getWorktreeScriptPath(taskId);
      if (existsSync(scriptPath)) {
        unlinkSync(scriptPath);
      }
    } catch (error) {
      throw new SchedulerError(
        `Failed to unregister task "${taskId}" from crontab`,
        this.platform,
        'unregister',
        error as Error
      );
    }
  }

  async isRegistered(taskId: string): Promise<boolean> {
    const currentCrontab = await this.getCurrentCrontab();
    return currentCrontab.includes(`${this.MARKER_PREFIX}${taskId}`);
  }

  async getStatus(): Promise<SchedulerStatus> {
    const tasks = await this.listRegistered();

    return {
      healthy: true, // crontab is always healthy if we can read it
      taskCount: tasks.length,
      errors: [],
      platform: this.platform,
    };
  }

  async listRegistered(): Promise<string[]> {
    const currentCrontab = await this.getCurrentCrontab();
    const taskIds: string[] = [];

    for (const line of currentCrontab.split('\n')) {
      const match = line.match(new RegExp(`${this.MARKER_PREFIX}(.+)$`));
      if (match && match[1]) {
        taskIds.push(match[1].trim());
      }
    }

    return taskIds;
  }

  /**
   * Get the current user's crontab content
   */
  private async getCurrentCrontab(): Promise<string> {
    try {
      const { stdout } = await execAsync('crontab -l');
      return stdout;
    } catch (error: unknown) {
      // "no crontab for user" is not an error for us
      const err = error as { stderr?: string };
      if (err.stderr?.includes('no crontab')) {
        return '';
      }
      throw error;
    }
  }

  /**
   * Set the user's crontab content
   */
  private async setCrontab(content: string): Promise<void> {
    // Write to temp file to avoid shell escaping issues entirely
    const tmpFile = join(homedir(), '.claude', 'matrix', 'dreamer', '.crontab.tmp');
    writeFileSync(tmpFile, content, 'utf-8');
    try {
      await execAsync(`crontab ${shellEscape(tmpFile)}`);
    } finally {
      unlinkSync(tmpFile);
    }
  }
}
