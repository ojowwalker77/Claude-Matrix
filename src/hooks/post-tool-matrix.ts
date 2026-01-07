#!/usr/bin/env bun
/**
 * PostToolUse:matrix_* Hook
 *
 * Runs after Matrix tool calls complete.
 * Suggests next actions to help Claude learn the memory workflow.
 *
 * Exit codes:
 *   0 = Success
 *   1 = Non-blocking error
 */

import {
  readStdin,
  outputText,
  hooksEnabled,
  type PostToolUseInput,
} from './index.js';

export async function run() {
  try {
    // Check if hooks are enabled
    if (!hooksEnabled()) {
      process.exit(0);
    }

    // Read input from stdin
    const input = await readStdin<PostToolUseInput>();
    const toolName = input.tool_name;
    const response = input.tool_response;

    // Only handle matrix tools
    if (!toolName?.includes('matrix_')) {
      process.exit(0);
    }

    // Parse response if possible
    let parsed: Record<string, unknown> = {};
    try {
      if (typeof response === 'string') {
        parsed = JSON.parse(response);
      } else if (response && typeof response === 'object') {
        // MCP tool responses have content field
        if ('content' in response) {
          parsed = typeof response.content === 'string'
            ? JSON.parse(response.content)
            : response.content as Record<string, unknown>;
        } else if ('text' in response) {
          parsed = JSON.parse(response.text as string);
        }
      }
    } catch {
      // Can't parse response, skip suggestions
      process.exit(0);
    }

    // Generate contextual suggestions based on tool and result
    const suggestions: string[] = [];

    if (toolName.includes('matrix_recall')) {
      const solutions = parsed.solutions as Array<{
        similarity?: number;
        successRate?: number;
        supersededBy?: string;
      }>;

      if (solutions?.length > 0) {
        const top = solutions[0];
        if (top?.supersededBy) {
          suggestions.push(`[Matrix] Note: Top solution superseded by ${top.supersededBy}`);
        }
        if (top?.successRate !== undefined && top.successRate < 0.5) {
          suggestions.push(`[Matrix] Caution: Top solution has ${Math.round(top.successRate * 100)}% success rate`);
        }
        if (top?.similarity !== undefined && top.similarity > 0.85) {
          suggestions.push('[Matrix] Strong match found - review solution before adapting');
        }
      } else {
        suggestions.push('[Matrix] No solutions found. Use matrix_store after solving.');
      }
    }

    if (toolName.includes('matrix_store')) {
      const id = parsed.id || parsed.solutionId;
      if (id) {
        suggestions.push(`[Matrix] Stored ${id}. Future recalls will surface this solution.`);
      }
    }

    if (toolName.includes('matrix_failure')) {
      suggestions.push('[Matrix] Error pattern recorded for future prevention.');
    }

    if (toolName.includes('matrix_reward')) {
      const outcome = parsed.outcome;
      if (outcome === 'success') {
        suggestions.push('[Matrix] Solution boosted. It will rank higher in future recalls.');
      } else if (outcome === 'failure') {
        suggestions.push('[Matrix] Solution demoted. Consider matrix_store with improved version.');
      }
    }

    // Output first suggestion only (brief)
    if (suggestions.length > 0) {
      outputText(suggestions[0]!);
    }

    process.exit(0);
  } catch (err) {
    // Log error but don't block
    console.error(`[Matrix] Post-tool hook error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

if (import.meta.main) run();
