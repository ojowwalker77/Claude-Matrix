#!/usr/bin/env bun
/**
 * SubagentStop Hook
 *
 * Runs when a subagent (Explore, Plan, etc.) completes.
 * Logs subagent completion for visibility.
 *
 * Exit codes:
 *   0 = Success
 *   1 = Non-blocking error (stderr shown to user)
 */

import {
  readStdin,
  outputJson,
  log,
  hooksEnabled,
  type SubagentStopInput,
  type HookOutput,
} from './index.js';
import { getConfig } from '../config/index.js';
import { getVerbosity } from './format-helpers.js';

export async function run() {
  try {
    // Check if hooks are enabled
    if (!hooksEnabled()) {
      process.exit(0);
    }

    // Read input from stdin
    const input = await readStdin<SubagentStopInput>();

    // Get verbosity
    const verbosity = getVerbosity();
    const config = getConfig();

    // Log completion in verbose mode
    if (config.toolSearch.verbose && verbosity !== 'minimal') {
      log(`[Matrix] Subagent ${input.agent_id || 'unknown'} completed`);
    }

    // Output empty - no context injection needed for stop
    const output: HookOutput = {};
    outputJson(output);
    process.exit(0);
  } catch (err) {
    // Log error but don't block
    console.error(
      `[Matrix] SubagentStop hook error: ${err instanceof Error ? err.message : err}`
    );
    process.exit(1);
  }
}

if (import.meta.main) run();
