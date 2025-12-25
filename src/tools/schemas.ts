import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOLS: Tool[] = [
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
  // Warning tools for Hooks integration
  {
    name: 'matrix_warn_check',
    description: 'Check if a file or package has warnings (personal grudges). Use before editing cursed files or installing problematic packages.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['file', 'package'],
          description: 'Type of warning to check',
        },
        target: {
          type: 'string',
          description: 'File path or package name to check',
        },
        ecosystem: {
          type: 'string',
          enum: ['npm', 'pip', 'cargo', 'go'],
          description: 'Package ecosystem (for packages only)',
        },
      },
      required: ['type', 'target'],
    },
  },
  {
    name: 'matrix_warn_add',
    description: 'Add a warning for a file or package. Use to mark problematic dependencies or cursed files.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['file', 'package'],
          description: 'Type of warning',
        },
        target: {
          type: 'string',
          description: 'File path (supports glob patterns like src/legacy/*) or package name',
        },
        reason: {
          type: 'string',
          description: 'Why this file/package is problematic',
        },
        severity: {
          type: 'string',
          enum: ['info', 'warn', 'block'],
          description: 'Severity level: info=note, warn=caution, block=stop and ask',
        },
        ecosystem: {
          type: 'string',
          enum: ['npm', 'pip', 'cargo', 'go'],
          description: 'Package ecosystem (for packages only)',
        },
        repoSpecific: {
          type: 'boolean',
          description: 'If true, warning only applies to current repository',
        },
      },
      required: ['type', 'target', 'reason'],
    },
  },
  {
    name: 'matrix_warn_remove',
    description: 'Remove a warning by ID or by type+target.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Warning ID to remove',
        },
        type: {
          type: 'string',
          enum: ['file', 'package'],
          description: 'Type of warning (use with target)',
        },
        target: {
          type: 'string',
          description: 'File path or package name (use with type)',
        },
        ecosystem: {
          type: 'string',
          enum: ['npm', 'pip', 'cargo', 'go'],
          description: 'Package ecosystem (for packages only)',
        },
      },
    },
  },
  {
    name: 'matrix_warn_list',
    description: 'List all warnings.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['file', 'package'],
          description: 'Filter by warning type',
        },
        repoOnly: {
          type: 'boolean',
          description: 'If true, only show warnings specific to current repository',
        },
      },
    },
  },
  // Prompt Agent
  {
    name: 'matrix_prompt',
    description: 'Analyze and optimize a prompt before execution. Detects ambiguity, infers context, and either returns an optimized prompt or asks clarification questions. Use for complex or ambiguous user requests.',
    inputSchema: {
      type: 'object',
      properties: {
        rawPrompt: {
          type: 'string',
          description: 'The original user prompt to analyze',
        },
        mode: {
          type: 'string',
          enum: ['interactive', 'auto', 'spawn'],
          description: 'interactive=ask for clarification, auto=use best judgment, spawn=for agent spawning (default: interactive)',
        },
        skipClarification: {
          type: 'boolean',
          description: 'If true, skip clarification questions and proceed with assumptions',
        },
      },
      required: ['rawPrompt'],
    },
  },
];
