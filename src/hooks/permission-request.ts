#!/usr/bin/env bun
/**
 * PermissionRequest Hook - Auto-Approve Read-Only Operations
 *
 * Automatically approves read-only tools to speed up workflow.
 * Write operations still require explicit user permission.
 *
 * Auto-approved:
 *   - Core Read: Read, Glob, Grep
 *   - Web: WebFetch, WebSearch
 *   - Matrix Read: matrix_recall, matrix_status, matrix_find_definition, etc.
 *   - Context7: resolve-library-id, query-docs
 *
 * Requires permission:
 *   - matrix_store, matrix_warn_add, matrix_warn_remove, matrix_failure
 *
 * Exit codes:
 *   0 = Success (JSON output processed)
 *   1 = Non-blocking error
 */

import {
  readStdin,
  outputJson,
  hooksEnabled,
  type HookInput,
  type HookOutput,
} from './index.js';
import { getConfig, type PermissionsConfig } from '../config/index.js';

export interface PermissionRequestInput extends HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

// ═══════════════════════════════════════════════════════════════
// Tool Categories
// ═══════════════════════════════════════════════════════════════

const CORE_READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);

const WEB_TOOLS = new Set(['WebFetch', 'WebSearch']);

const MATRIX_READ_TOOLS = new Set([
  'mcp__plugin_matrix_matrix__matrix_recall',
  'mcp__plugin_matrix_matrix__matrix_status',
  'mcp__plugin_matrix_matrix__matrix_warn_check',
  'mcp__plugin_matrix_matrix__matrix_warn_list',
  'mcp__plugin_matrix_matrix__matrix_find_definition',
  'mcp__plugin_matrix_matrix__matrix_search_symbols',
  'mcp__plugin_matrix_matrix__matrix_list_exports',
  'mcp__plugin_matrix_matrix__matrix_get_imports',
  'mcp__plugin_matrix_matrix__matrix_index_status',
  'mcp__plugin_matrix_matrix__matrix_reindex',
  'mcp__plugin_matrix_matrix__matrix_repomix',
  'mcp__plugin_matrix_matrix__matrix_prompt',
]);

const CONTEXT7_TOOLS = new Set([
  'mcp__plugin_matrix_context7__resolve-library-id',
  'mcp__plugin_matrix_context7__query-docs',
]);

// ═══════════════════════════════════════════════════════════════
// Permission Logic
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a tool should be auto-approved based on config
 */
function shouldAutoApprove(toolName: string, config: PermissionsConfig): boolean {
  // Check never auto-approve list first (highest priority)
  if (config.neverAutoApprove.includes(toolName)) {
    return false;
  }

  // Check additional auto-approve list
  if (config.additionalAutoApprove.includes(toolName)) {
    return true;
  }

  // Skip if auto-approve read-only is disabled
  if (!config.autoApproveReadOnly) {
    return false;
  }

  // Check category flags
  if (config.autoApprove.coreRead && CORE_READ_TOOLS.has(toolName)) {
    return true;
  }

  if (config.autoApprove.web && WEB_TOOLS.has(toolName)) {
    return true;
  }

  if (config.autoApprove.matrixRead && MATRIX_READ_TOOLS.has(toolName)) {
    return true;
  }

  if (config.autoApprove.context7 && CONTEXT7_TOOLS.has(toolName)) {
    return true;
  }

  return false;
}

export async function run() {
  try {
    // Check if hooks are enabled
    if (!hooksEnabled()) {
      process.exit(0);
    }

    // Read input from stdin
    const input = await readStdin<PermissionRequestInput>();

    // Get config
    const config = getConfig();
    const permConfig = config.hooks.permissions;

    const toolName = input.tool_name;

    // Check if tool should be auto-approved
    if (shouldAutoApprove(toolName, permConfig)) {
      // Output allow decision - Claude Code will process this
      const output: HookOutput = {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: { behavior: 'allow' },
        },
      };
      outputJson(output);
      process.exit(0);
    }

    // Tool not auto-approved - let normal permission flow handle it
    // Exit with no output = no intervention
    process.exit(0);
  } catch (err) {
    // Log error but don't block
    console.error(`[Matrix] Permission hook error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

if (import.meta.main) run();
