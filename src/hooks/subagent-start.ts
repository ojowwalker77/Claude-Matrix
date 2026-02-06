#!/usr/bin/env bun
/**
 * SubagentStart Hook
 *
 * Runs when a subagent (Explore, Plan, etc.) starts.
 * Injects Matrix-specific guidance:
 *   - Prefer Matrix index tools over Grep for code search
 *   - Prefer Context7 over WebSearch for library docs
 *
 * Exit codes:
 *   0 = Success (output used by Claude Code)
 *   1 = Non-blocking error (stderr shown to user)
 */

import {
  readStdin,
  outputJson,
  hooksEnabled,
  type SubagentStartInput,
  type HookOutput,
} from './index.js';
import { getConfig } from '../config/index.js';
import { getVerbosity } from './format-helpers.js';

/**
 * Build guidance context for subagents based on config
 */
function buildSubagentGuidance(agentType: string): string[] {
  const config = getConfig();
  const toolSearch = config.toolSearch;
  const verbosity = getVerbosity();

  const guidance: string[] = [];

  // Matrix Index preference
  if (toolSearch.preferMatrixIndex) {
    if (verbosity === 'compact') {
      guidance.push(
        '[Matrix] Prefer matrix_find_definition, matrix_search_symbols over Grep for code search'
      );
    } else {
      guidance.push(
        '[Matrix Guidance] For code navigation and symbol search, prefer these Matrix tools:',
        '  - matrix_find_definition: Find where a symbol is defined',
        '  - matrix_search_symbols: Search for symbols by name pattern',
        '  - matrix_list_exports: List exported symbols from a file',
        '  - matrix_get_imports: Get imports for a file',
        'These are faster and more accurate than Grep for code structure queries.'
      );
    }
  }

  // Context7 preference
  if (toolSearch.preferContext7) {
    if (verbosity === 'compact') {
      guidance.push(
        '[Matrix] Prefer Context7 (resolve-library-id + query-docs) over WebSearch for library docs'
      );
    } else {
      guidance.push(
        '[Matrix Guidance] For library documentation lookup, prefer Context7 tools:',
        '  1. resolve-library-id: Get the Context7 library ID for a package',
        '  2. query-docs: Query documentation with the resolved library ID',
        'Context7 provides accurate, up-to-date documentation without web search noise.'
      );
    }
  }

  // Agent-specific guidance for explore/plan agents
  const agentTypeLower = (agentType || '').toLowerCase();
  if (agentTypeLower === 'explore' || agentTypeLower === 'plan') {
    if (verbosity === 'full') {
      guidance.push(
        `[Matrix Guidance for ${agentType} agent]`,
        'Use matrix_recall to check for existing solutions before implementing new ones.',
        'Use matrix_index_status to check if code index is available for this repository.'
      );
    } else {
      guidance.push('[Matrix] Check matrix_recall for existing solutions');
    }
  }

  return guidance;
}

export async function run() {
  try {
    // Check if hooks are enabled
    if (!hooksEnabled()) {
      process.exit(0);
    }

    // Read input from stdin
    const input = await readStdin<SubagentStartInput>();

    // Get config
    const config = getConfig();
    const toolSearch = config.toolSearch;

    // Skip if tool search preferences are all disabled
    if (!toolSearch.preferMatrixIndex && !toolSearch.preferContext7) {
      process.exit(0);
    }

    // Build guidance
    const guidance = buildSubagentGuidance(input.agent_type);

    if (guidance.length === 0) {
      process.exit(0);
    }

    // Format guidance as context
    const additionalContext = guidance.join('\n');

    // Build output
    const output: HookOutput = {
      hookSpecificOutput: {
        additionalContext,
      },
    };

    // Optional: show terminal message in verbose mode
    if (toolSearch.verbose) {
      output.systemMessage = `[Matrix] Injected guidance for ${input.agent_type || 'unknown'} subagent`;
    }

    outputJson(output);
    process.exit(0);
  } catch (err) {
    // Log error but don't block subagent
    console.error(
      `[Matrix] SubagentStart hook error: ${err instanceof Error ? err.message : err}`
    );
    process.exit(1);
  }
}

if (import.meta.main) run();
