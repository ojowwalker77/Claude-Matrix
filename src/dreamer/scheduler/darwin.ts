/**
 * Darwin (macOS) Scheduler - launchd Implementation
 *
 * Manages scheduled tasks using macOS launchd plist files.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
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
 * macOS launchd scheduler implementation
 */
export class DarwinScheduler extends BaseScheduler {
  readonly name = 'launchd';
  readonly platform = 'darwin' as const;

  private readonly launchAgentsDir: string;

  constructor() {
    super();
    this.launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');
  }

  /**
   * Get the plist file path for a task
   */
  private getPlistPath(taskId: string): string {
    return join(this.launchAgentsDir, `${this.getTaskLabel(taskId)}.plist`);
  }

  /**
   * Get the path for a worktree script
   */
  private getWorktreeScriptPath(taskId: string): string {
    return join(getLogsDir(), `${taskId}.worktree.sh`);
  }

  async register(task: DreamerTask): Promise<void> {
    try {
      // Ensure LaunchAgents directory exists
      if (!existsSync(this.launchAgentsDir)) {
        mkdirSync(this.launchAgentsDir, { recursive: true });
      }

      // Ensure logs directory exists
      const logDir = getLogsDir();
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      // Generate and write worktree script if enabled
      if (this.usesWorktree(task)) {
        const script = this.generateWorktreeScript(task, logDir);
        if (script) {
          const scriptPath = this.getWorktreeScriptPath(task.id);
          writeFileSync(scriptPath, script, { mode: 0o755 });
        }
      }

      const plistContent = this.generatePlist(task);
      const plistPath = this.getPlistPath(task.id);

      // Unload existing if present (ignore errors)
      try {
        await execAsync(`launchctl unload ${shellEscape(plistPath)}`);
      } catch {
        // Ignore - might not be loaded
      }

      // Write plist file
      writeFileSync(plistPath, plistContent, 'utf-8');

      // Load the agent
      await execAsync(`launchctl load ${shellEscape(plistPath)}`);
    } catch (error) {
      throw new SchedulerError(
        `Failed to register task "${task.name}" with launchd`,
        this.platform,
        'register',
        error as Error
      );
    }
  }

  async unregister(taskId: string): Promise<void> {
    const plistPath = this.getPlistPath(taskId);

    try {
      // Unload agent (ignore errors if not loaded)
      try {
        await execAsync(`launchctl unload ${shellEscape(plistPath)}`);
      } catch {
        // Ignore - might not be loaded
      }

      // Remove plist file
      if (existsSync(plistPath)) {
        unlinkSync(plistPath);
      }

      // Remove worktree script if exists
      const scriptPath = this.getWorktreeScriptPath(taskId);
      if (existsSync(scriptPath)) {
        unlinkSync(scriptPath);
      }
    } catch (error) {
      throw new SchedulerError(
        `Failed to unregister task "${taskId}" from launchd`,
        this.platform,
        'unregister',
        error as Error
      );
    }
  }

  async isRegistered(taskId: string): Promise<boolean> {
    const plistPath = this.getPlistPath(taskId);
    return existsSync(plistPath);
  }

  async getStatus(): Promise<SchedulerStatus> {
    const tasks = await this.listRegistered();
    const errors: string[] = [];

    for (const taskId of tasks) {
      try {
        const label = this.getTaskLabel(taskId);
        const { stdout } = await execAsync(`launchctl list ${label}`);
        if (stdout.includes('Could not find')) {
          errors.push(`Task ${taskId} plist exists but not loaded`);
        }
      } catch {
        errors.push(`Task ${taskId} check failed`);
      }
    }

    return {
      healthy: errors.length === 0,
      taskCount: tasks.length,
      errors,
      platform: this.platform,
    };
  }

  async listRegistered(): Promise<string[]> {
    try {
      if (!existsSync(this.launchAgentsDir)) {
        return [];
      }

      const files = readdirSync(this.launchAgentsDir);
      const prefix = 'com.claude.dreamer.';
      const suffix = '.plist';

      return files
        .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
        .map((f) => f.slice(prefix.length, -suffix.length));
    } catch {
      return [];
    }
  }

  /**
   * Generate launchd plist content for a task
   */
  private generatePlist(task: DreamerTask): string {
    const label = this.getTaskLabel(task.id);
    const calendarInterval = this.cronToCalendarInterval(task.cronExpression);
    const logDir = getLogsDir();

    // Determine the program arguments based on whether worktree is enabled
    let programArgs: string;
    if (this.usesWorktree(task)) {
      const scriptPath = this.getWorktreeScriptPath(task.id);
      programArgs = `    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${this.escapeXml(scriptPath)}</string>
    </array>`;
    } else {
      const command = this.getExecutionCommand(task);
      const workDir = this.getWorkingDirectory(task);
      // Use shell escaping for workDir (single quotes prevent injection)
      // Then XML escape the entire bash command for plist embedding
      const shellCmd = `cd ${shellEscape(workDir)} && ${command}`;
      programArgs = `    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>${this.escapeXml(shellCmd)}</string>
    </array>`;
    }

    // Build environment variables
    let envSection = `    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${process.env.HOME}/.local/bin</string>`;

    // Add custom env vars
    if (task.env && Object.keys(task.env).length > 0) {
      for (const [key, value] of Object.entries(task.env)) {
        envSection += `
        <key>${this.escapeXml(key)}</key>
        <string>${this.escapeXml(value)}</string>`;
      }
    }
    envSection += `
    </dict>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${this.escapeXml(label)}</string>

${programArgs}

    ${calendarInterval}

    <key>StandardOutPath</key>
    <string>${logDir}/${task.id}.out.log</string>

    <key>StandardErrorPath</key>
    <string>${logDir}/${task.id}.err.log</string>

    <key>RunAtLoad</key>
    <false/>

${envSection}
</dict>
</plist>`;
  }

  /**
   * Convert cron expression to launchd StartCalendarInterval
   */
  private cronToCalendarInterval(expression: string): string {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: ${expression}`);
    }

    const minute = parts[0]!;
    const hour = parts[1]!;
    const day = parts[2]!;
    const month = parts[3]!;
    const weekday = parts[4]!;

    // Parse each field with appropriate bounds
    const mins = minute !== '*' ? this.parseField(minute, 0, 59) : null;
    const hours = hour !== '*' ? this.parseField(hour, 0, 23) : null;
    const days = day !== '*' ? this.parseField(day, 1, 31) : null;
    const months = month !== '*' ? this.parseField(month, 1, 12) : null;
    const weekdays = weekday !== '*' ? this.parseField(weekday, 0, 6) : null;

    // Build the dict entries for a single interval
    const buildDict = (
      m: number | null,
      h: number | null,
      d: number | null,
      mo: number | null,
      wd: number | null
    ): string => {
      let dict = '    <dict>\n';
      if (m !== null) dict += `        <key>Minute</key>\n        <integer>${m}</integer>\n`;
      if (h !== null) dict += `        <key>Hour</key>\n        <integer>${h}</integer>\n`;
      if (d !== null) dict += `        <key>Day</key>\n        <integer>${d}</integer>\n`;
      if (mo !== null) dict += `        <key>Month</key>\n        <integer>${mo}</integer>\n`;
      if (wd !== null) dict += `        <key>Weekday</key>\n        <integer>${wd}</integer>\n`;
      dict += '    </dict>';
      return dict;
    };

    // Generate cartesian product of all field values
    const minValues = mins ?? [null];
    const hourValues = hours ?? [null];
    const dayValues = days ?? [null];
    const monthValues = months ?? [null];
    const weekdayValues = weekdays ?? [null];

    const dicts: string[] = [];
    for (const m of minValues) {
      for (const h of hourValues) {
        for (const d of dayValues) {
          for (const mo of monthValues) {
            for (const wd of weekdayValues) {
              dicts.push(buildDict(m, h, d, mo, wd));
            }
          }
        }
      }
    }

    // If only one interval, use dict format; otherwise use array format
    if (dicts.length === 1) {
      return `<key>StartCalendarInterval</key>\n${dicts[0]}`;
    }

    return `<key>StartCalendarInterval</key>\n    <array>\n${dicts.join('\n')}\n    </array>`;
  }

  /**
   * Parse a cron field to extract numeric values
   */
  private parseField(field: string, min: number, max: number): number[] {
    const values: number[] = [];

    for (const part of field.split(',')) {
      if (part.includes('/')) {
        // Handle step values like */15 or 0-30/5
        const splitParts = part.split('/');
        const range = splitParts[0] ?? '*';
        const step = Number(splitParts[1] ?? 1);
        let start = min;
        let end = max;

        if (range !== '*') {
          if (range.includes('-')) {
            const rangeParts = range.split('-').map(Number);
            start = rangeParts[0] ?? min;
            end = rangeParts[1] ?? max;
          } else {
            start = Number(range);
          }
        }

        for (let i = start; i <= end; i += step) {
          values.push(i);
        }
      } else if (part.includes('-')) {
        const rangeParts = part.split('-').map(Number);
        const start = rangeParts[0] ?? min;
        const end = rangeParts[1] ?? max;
        for (let i = start; i <= end; i++) {
          values.push(i);
        }
      } else {
        values.push(Number(part));
      }
    }

    // Filter values to be within valid bounds
    return values.filter((v) => v >= min && v <= max);
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
