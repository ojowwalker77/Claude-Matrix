#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { getDb, closeDb } from './db/client.js';
import { matrixStore } from './tools/store.js';
import { matrixRecall } from './tools/recall.js';
import { matrixReward } from './tools/reward.js';
import { matrixFailure, searchFailures } from './tools/failure.js';

const TOOLS: Tool[] = [
  {
    name: 'matrix_recall',
    description: 'Search for relevant solutions from past experience. Use before implementing non-trivial solutions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What problem are you trying to solve?',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 5)',
        },
        minScore: {
          type: 'number',
          description: 'Minimum similarity score 0-1 (default: 0.3)',
        },
        scopeFilter: {
          type: 'string',
          enum: ['all', 'repo', 'stack', 'global'],
          description: 'Filter by solution scope (default: all)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'matrix_store',
    description: 'Store a successful solution for future recall. Use after solving a reusable problem.',
    inputSchema: {
      type: 'object',
      properties: {
        problem: {
          type: 'string',
          description: 'The problem that was solved',
        },
        solution: {
          type: 'string',
          description: 'The solution (code, steps, explanation)',
        },
        scope: {
          type: 'string',
          enum: ['global', 'stack', 'repo'],
          description: 'global=works anywhere, stack=same tech stack, repo=this repo only',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization (e.g., ["auth", "oauth", "google"])',
        },
        filesAffected: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files that were modified',
        },
      },
      required: ['problem', 'solution', 'scope'],
    },
  },
  {
    name: 'matrix_reward',
    description: 'Provide feedback on a recalled solution. Improves future recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        solutionId: {
          type: 'string',
          description: 'ID of the solution (from matrix_recall)',
        },
        outcome: {
          type: 'string',
          enum: ['success', 'partial', 'failure'],
          description: 'success=worked as-is, partial=needed changes, failure=did not work',
        },
        notes: {
          type: 'string',
          description: 'What worked or what needed to change',
        },
      },
      required: ['solutionId', 'outcome'],
    },
  },
  {
    name: 'matrix_failure',
    description: 'Record an error and its fix for future prevention.',
    inputSchema: {
      type: 'object',
      properties: {
        errorType: {
          type: 'string',
          enum: ['runtime', 'build', 'test', 'type', 'other'],
        },
        errorMessage: {
          type: 'string',
          description: 'The error message',
        },
        stackTrace: {
          type: 'string',
          description: 'Stack trace if available',
        },
        rootCause: {
          type: 'string',
          description: 'What actually caused the error',
        },
        fixApplied: {
          type: 'string',
          description: 'How it was fixed',
        },
        prevention: {
          type: 'string',
          description: 'How to avoid this in the future',
        },
        filesInvolved: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['errorType', 'errorMessage', 'rootCause', 'fixApplied'],
    },
  },
  {
    name: 'matrix_status',
    description: 'Get Matrix memory statistics.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  // Ensure DB is initialized
  getDb();

  switch (name) {
    case 'matrix_recall': {
      const result = await matrixRecall({
        query: args['query'] as string,
        limit: args['limit'] as number | undefined,
        minScore: args['minScore'] as number | undefined,
        scopeFilter: args['scopeFilter'] as 'all' | 'repo' | 'stack' | 'global' | undefined,
      });

      // Also search for related failures
      const relatedFailures = await searchFailures(args['query'] as string, 2);

      return JSON.stringify({
        ...result,
        relatedFailures: relatedFailures.length > 0 ? relatedFailures : undefined,
      }, null, 2);
    }

    case 'matrix_store': {
      const result = await matrixStore({
        problem: args['problem'] as string,
        solution: args['solution'] as string,
        scope: args['scope'] as 'global' | 'stack' | 'repo',
        tags: args['tags'] as string[] | undefined,
        filesAffected: args['filesAffected'] as string[] | undefined,
      });
      return JSON.stringify(result, null, 2);
    }

    case 'matrix_reward': {
      const result = await matrixReward({
        solutionId: args['solutionId'] as string,
        outcome: args['outcome'] as 'success' | 'partial' | 'failure',
        notes: args['notes'] as string | undefined,
      });
      return JSON.stringify(result, null, 2);
    }

    case 'matrix_failure': {
      const result = await matrixFailure({
        errorType: args['errorType'] as 'runtime' | 'build' | 'test' | 'type' | 'other',
        errorMessage: args['errorMessage'] as string,
        stackTrace: args['stackTrace'] as string | undefined,
        rootCause: args['rootCause'] as string,
        fixApplied: args['fixApplied'] as string,
        prevention: args['prevention'] as string | undefined,
        filesInvolved: args['filesInvolved'] as string[] | undefined,
      });
      return JSON.stringify(result, null, 2);
    }

    case 'matrix_status': {
      const db = getDb();
      const solutions = db.query('SELECT COUNT(*) as count FROM solutions').get() as { count: number };
      const failures = db.query('SELECT COUNT(*) as count FROM failures').get() as { count: number };
      const repos = db.query('SELECT COUNT(*) as count FROM repos').get() as { count: number };

      const topTags = db.query(`
        SELECT json_each.value as tag, COUNT(*) as count
        FROM solutions, json_each(solutions.tags)
        GROUP BY json_each.value
        ORDER BY count DESC
        LIMIT 10
      `).all() as Array<{ tag: string; count: number }>;

      const recentSolutions = db.query(`
        SELECT id, problem, scope, score, created_at
        FROM solutions
        ORDER BY created_at DESC
        LIMIT 5
      `).all();

      return JSON.stringify({
        status: 'operational',
        database: 'connected',
        stats: {
          solutions: solutions.count,
          failures: failures.count,
          repos: repos.count,
        },
        topTags: topTags.map(t => t.tag),
        recentSolutions,
      }, null, 2);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function main(): Promise<void> {
  const server = new Server(
    {
      name: 'matrix',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleToolCall(name, args ?? {});
      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', () => {
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    closeDb();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
