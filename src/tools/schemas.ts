import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOLS: Tool[] = [
  {
    name: 'matrix_recall',
    description: 'Search for relevant solutions from past experience. Use before implementing non-trivial solutions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What problem are you trying to solve?' },
        limit: { type: 'number', description: 'Maximum number of results (default: 5)' },
        minScore: { type: 'number', description: 'Minimum similarity score 0-1 (default: 0.3)' },
        scopeFilter: { type: 'string', enum: ['all', 'repo', 'stack', 'global'], description: 'Filter by solution scope (default: all)' },
        categoryFilter: { type: 'string', enum: ['bugfix', 'feature', 'refactor', 'config', 'pattern', 'optimization'], description: 'Filter by category' },
        maxComplexity: { type: 'number', minimum: 1, maximum: 10, description: 'Only return solutions with complexity <= this value' },
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
        problem: { type: 'string', description: 'The problem that was solved' },
        solution: { type: 'string', description: 'The solution (code, steps, explanation)' },
        scope: { type: 'string', enum: ['global', 'stack', 'repo'], description: 'global=works anywhere, stack=same tech stack, repo=this repo only' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
        filesAffected: { type: 'array', items: { type: 'string' }, description: 'Files that were modified' },
        category: { type: 'string', enum: ['bugfix', 'feature', 'refactor', 'config', 'pattern', 'optimization'], description: 'Solution type' },
        complexity: { type: 'number', minimum: 1, maximum: 10, description: 'Complexity 1-10 (auto-calculated if not provided)' },
        prerequisites: { type: 'array', items: { type: 'string' }, description: 'Conditions for this solution to apply' },
        antiPatterns: { type: 'array', items: { type: 'string' }, description: 'What NOT to do' },
        codeBlocks: { type: 'array', items: { type: 'object', properties: { language: { type: 'string' }, code: { type: 'string' }, description: { type: 'string' } }, required: ['language', 'code', 'description'] }, description: 'Code snippets' },
        relatedSolutions: { type: 'array', items: { type: 'string' }, description: 'IDs of related solutions' },
        supersedes: { type: 'string', description: 'ID of solution this replaces' },
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
  // Code Index Tools
  {
    name: 'matrix_find_definition',
    description: 'Find where a symbol (function, class, type, variable) is defined in the codebase. Use this to navigate to symbol definitions.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The symbol name to find (e.g., "handleRequest", "UserService")',
        },
        kind: {
          type: 'string',
          enum: ['function', 'class', 'interface', 'type', 'enum', 'variable', 'const', 'method', 'property'],
          description: 'Optional: filter by symbol kind',
        },
        file: {
          type: 'string',
          description: 'Optional: limit search to a specific file path',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'matrix_list_exports',
    description: 'List all exported symbols from a file or directory. Use to understand what a module exposes.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File or directory path to list exports from (e.g., "src/utils" or "src/index.ts")',
        },
      },
    },
  },
  {
    name: 'matrix_search_symbols',
    description: 'Search for symbols by partial name match. Use when you know part of a symbol name.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Partial symbol name to search for (e.g., "handle" finds "handleRequest", "handleError")',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 20)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'matrix_get_imports',
    description: 'Get all imports in a specific file. Use to understand file dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'File path to get imports from',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'matrix_index_status',
    description: 'Get the current status of the code index for this repository.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'matrix_reindex',
    description: 'Manually trigger repository reindexing. Use to refresh the code index after changes.',
    inputSchema: {
      type: 'object',
      properties: {
        full: {
          type: 'boolean',
          description: 'Force full reindex, ignoring incremental mode (default: false)',
        },
      },
    },
  },
  // Repomix Integration
  {
    name: 'matrix_repomix',
    description: 'Pack external repositories for context. Two-phase flow: Phase 1 (no files) returns suggested files based on query. Phase 2 (with confirmedFiles) packs those files. Minimizes token consumption by letting you confirm before packing.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'GitHub shorthand (owner/repo) or local path',
        },
        query: {
          type: 'string',
          description: 'What implementation are you looking for? Used for semantic search.',
        },
        branch: {
          type: 'string',
          description: 'Git branch (default: HEAD/main)',
        },
        confirmedFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files to pack (from Phase 1 suggestions). Omit for Phase 1 index.',
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens for packed output (default: 30000)',
        },
        maxFiles: {
          type: 'number',
          description: 'Maximum files to suggest in Phase 1 (default: 15)',
        },
        cacheTTLHours: {
          type: 'number',
          description: 'Cache TTL in hours (default: 24)',
        },
      },
      required: ['target', 'query'],
    },
  },
];
