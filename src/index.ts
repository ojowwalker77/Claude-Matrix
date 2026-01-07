#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { closeDb } from './db/index.js';
import { TOOLS } from './tools/index.js';
import { handleToolCall } from './server/index.js';
import { getConfig } from './config/index.js';

function buildInstructions(): string {
  const config = getConfig();
  const sections: string[] = [];

  // Code Search Priority (controlled by toolSearch.preferMatrixIndex)
  if (config.toolSearch.enabled && config.toolSearch.preferMatrixIndex) {
    sections.push(`## Code Search Priority
ALWAYS prefer Matrix index tools over grep/bash for code searches:
- matrix_find_definition: Find function/class/type definitions (faster than grep)
- matrix_search_symbols: Search symbols by partial name
- matrix_list_exports: List exports from file/directory
- matrix_get_imports: Get imports in a file

Only fall back to Grep/Bash when:
- The index is not available (matrix_index_status shows not indexed)
- Searching for non-symbol content (comments, strings, configs)
- The query is a complex regex pattern`);
  }

  // Documentation Lookup Priority (controlled by toolSearch.preferContext7)
  if (config.toolSearch.enabled && config.toolSearch.preferContext7) {
    sections.push(`## Documentation Lookup Priority
ALWAYS prefer Context7 over WebFetch/WebSearch for library documentation:
- First: resolve-library-id to find the library
- Then: query-docs to get up-to-date documentation

Only use WebFetch/WebSearch when:
- Context7 doesn't have the library
- You need very recent news/updates (last few days)
- The query is about a non-library topic`);
  }

  // Subagent Instructions (only if tool search is enabled)
  if (config.toolSearch.enabled) {
    const subagentInstructions: string[] = [];
    if (config.toolSearch.preferMatrixIndex) {
      subagentInstructions.push('- Include in the prompt: "Use matrix_find_definition and matrix_search_symbols for code searches instead of grep"');
    }
    if (config.toolSearch.preferContext7) {
      subagentInstructions.push('- Include: "Use Context7 (resolve-library-id, query-docs) for library documentation instead of WebSearch"');
    }
    if (subagentInstructions.length > 0) {
      sections.push(`## Subagent Instructions
When spawning Task agents (Explore, Plan, general-purpose):
${subagentInstructions.join('\n')}`);
    }
  }

  // Cost Optimization (always included)
  sections.push(`## Cost Optimization
Delegate read-only tools to Haiku sub-agents via Task(model="haiku"):
- matrix_recall, matrix_reward, matrix_status
- matrix_warn_check, matrix_warn_add, matrix_warn_remove, matrix_warn_list
- matrix_find_definition, matrix_search_symbols, matrix_list_exports, matrix_get_imports
- matrix_index_status, matrix_reindex`);

  // When to Use Matrix Tools (always included)
  sections.push(`## When to Use Matrix Tools

BEFORE implementing:
- matrix_recall: Check if similar problem was solved before
- matrix_warn_check: Check if touching a cursed file/package

AFTER implementing:
- matrix_store: Save reusable solutions (not one-offs)
- matrix_reward: Rate a recalled solution that helped
- matrix_failure: Record errors you fixed (prevents recurrence)

DON'T USE for:
- Simple questions (what is X, where is Y)
- Trivial fixes (typos, renames, one-liners)
- User errors (wrong command, typos in input)`);

  return sections.join('\n\n');
}

async function main(): Promise<void> {
  const instructions = buildInstructions();

  const server = new Server(
    { name: 'matrix', version: '0.2.0' },
    {
      capabilities: { tools: {} },
      instructions,
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleToolCall(name, args ?? {});
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = () => {
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
