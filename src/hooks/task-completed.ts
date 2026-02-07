#!/usr/bin/env bun
/**
 * TaskCompleted Hook
 *
 * Runs when a Claude Code task completes (Agent Teams, v2.1.32+).
 * Suggests storing the solution in Matrix memory if the task was
 * significant enough (high token/tool usage).
 *
 * Exit codes:
 *   0 = Success
 *   1 = Non-blocking error
 */

import {
  readStdin,
  outputJson,
  hooksEnabled,
  log,
  type HookInput,
  type HookOutput,
} from './index.js';
import { getConfig } from '../config/index.js';

export interface TaskCompletedInput extends HookInput {
  task_id?: string;
  task_subject?: string;
  task_description?: string;
  total_tokens?: number;
  tool_uses?: number;
  duration_ms?: number;
}

/**
 * Check if a completed task is significant enough to suggest storing
 */
function isSignificantTask(input: TaskCompletedInput): boolean {
  // At least 5 tool uses or 20k tokens suggests meaningful work
  if ((input.tool_uses ?? 0) >= 5) return true;
  if ((input.total_tokens ?? 0) >= 20000) return true;
  return false;
}

export async function run() {
  try {
    if (!hooksEnabled()) {
      process.exit(0);
    }

    const input = await readStdin<TaskCompletedInput>();
    const config = getConfig();

    // Skip if store suggestions are disabled
    if (!config.hooks.stop?.suggestStore?.enabled) {
      process.exit(0);
    }

    if (!isSignificantTask(input)) {
      process.exit(0);
    }

    // Suggest storing the solution
    const subject = input.task_subject || 'Unknown task';
    const tokens = input.total_tokens ? `${Math.round(input.total_tokens / 1000)}k tokens` : '';
    const tools = input.tool_uses ? `${input.tool_uses} tool uses` : '';
    const stats = [tokens, tools].filter(Boolean).join(', ');

    log(`[Matrix] Significant task completed: "${subject}" (${stats}). Consider using matrix_store to save this solution.`);

    const output: HookOutput = {};
    outputJson(output);
    process.exit(0);
  } catch (err) {
    console.error(`[Matrix] TaskCompleted hook error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

if (import.meta.main) run();
