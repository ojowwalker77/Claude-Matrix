#!/usr/bin/env bun
/**
 * PreToolUse:Edit Hook
 *
 * Runs before Edit or Write tool executes.
 * Checks if the file has warnings ("cursed files") and asks user if needed.
 *
 * Exit codes:
 *   0 = Success (allows tool to proceed)
 *   1 = Non-blocking error
 *   2 = Blocking error (stops tool)
 */

import {
  readStdin,
  outputJson,
  hooksEnabled,
  type PreToolUseInput,
  type HookOutput,
} from './index.js';
import { matrixWarnCheck } from '../tools/warn.js';
import { printToUser, renderFileWarningBox, renderErrorBox } from './ui.js';

export async function run() {
  try {
    // Check if hooks are enabled
    if (!hooksEnabled()) {
      process.exit(0);
    }

    // Read input from stdin
    const input = await readStdin<PreToolUseInput>();

    // Get file path from tool input
    const filePath = input.tool_input.file_path as string | undefined;
    if (!filePath) {
      process.exit(0);
    }

    // Check for file warnings
    const result = await matrixWarnCheck({
      type: 'file',
      target: filePath,
    });

    if (!result.hasWarning) {
      process.exit(0);
    }

    // Check if any warnings are blocking
    const blockingWarnings = result.warnings.filter(w => w.severity === 'block');
    const warnWarnings = result.warnings.filter(w => w.severity === 'warn');

    // Determine highest severity
    const severity = blockingWarnings.length > 0 ? 'block' : warnWarnings.length > 0 ? 'warn' : 'info';

    // Display warning box to user
    const box = renderFileWarningBox(filePath, result.warnings.length, severity);
    printToUser(box);

    if (blockingWarnings.length > 0) {
      // Blocking warning - ask user
      const reasons = blockingWarnings
        .map(w => `• ${w.reason}${w.repoSpecific ? ' (repo-specific)' : ''}`)
        .join('\n');

      const output: HookOutput = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `Matrix Warning - Cursed file detected:\n\nFile: ${filePath}\n\n${reasons}\n\nThis file has been marked as problematic. Proceed anyway?`,
        },
      };

      outputJson(output);
      process.exit(0);
    }

    process.exit(0);
  } catch (err) {
    // Log error but don't block
    const errorBox = renderErrorBox('Warning', err instanceof Error ? err.message : 'Unknown error');
    printToUser(errorBox);
    process.exit(1);
  }
}

if (import.meta.main) run();
