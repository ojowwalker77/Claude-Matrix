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

const MCP_INSTRUCTIONS = `
## Code Search Priority
ALWAYS prefer Matrix index tools over grep/bash for code searches:
- matrix_find_definition: Find function/class/type definitions (faster than grep)
- matrix_search_symbols: Search symbols by partial name
- matrix_list_exports: List exports from file/directory
- matrix_get_imports: Get imports in a file

Only fall back to Grep/Bash when:
- The index is not available (matrix_index_status shows not indexed)
- Searching for non-symbol content (comments, strings, configs)
- The query is a complex regex pattern

## Documentation Lookup Priority
ALWAYS prefer Context7 over WebFetch/WebSearch for library documentation:
- First: resolve-library-id to find the library
- Then: query-docs to get up-to-date documentation

Only use WebFetch/WebSearch when:
- Context7 doesn't have the library
- You need very recent news/updates (last few days)
- The query is about a non-library topic

## Subagent Instructions
When spawning Task agents (Explore, Plan, general-purpose):
- Include in the prompt: "Use matrix_find_definition and matrix_search_symbols for code searches instead of grep"
- Include: "Use Context7 (resolve-library-id, query-docs) for library documentation instead of WebSearch"

## Cost Optimization
Delegate read-only tools to Haiku sub-agents via Task(model="haiku"):
- matrix_recall, matrix_reward, matrix_status
- matrix_warn_check, matrix_warn_add, matrix_warn_remove, matrix_warn_list
- matrix_find_definition, matrix_search_symbols, matrix_list_exports, matrix_get_imports
- matrix_index_status, matrix_reindex
`.trim();

async function main(): Promise<void> {
  const server = new Server(
    { name: 'matrix', version: '0.2.0' },
    {
      capabilities: { tools: {} },
      instructions: MCP_INSTRUCTIONS,
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
