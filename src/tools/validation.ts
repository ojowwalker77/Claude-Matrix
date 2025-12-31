/**
 * TypeBox Schemas and Validators
 *
 * Single source of truth for:
 * - TypeScript types (inferred from schemas)
 * - JSON Schema (for MCP inputSchema)
 * - Runtime validation (compiled validators)
 */

import { Type, type Static } from '@sinclair/typebox';
import { TypeCompiler, type TypeCheck } from '@sinclair/typebox/compiler';

// ============================================================================
// Shared Types
// ============================================================================

const ScopeEnum = Type.Union([
  Type.Literal('global'),
  Type.Literal('stack'),
  Type.Literal('repo'),
]);

const ScopeFilterEnum = Type.Union([
  Type.Literal('all'),
  Type.Literal('repo'),
  Type.Literal('stack'),
  Type.Literal('global'),
]);

const CategoryEnum = Type.Union([
  Type.Literal('bugfix'),
  Type.Literal('feature'),
  Type.Literal('refactor'),
  Type.Literal('config'),
  Type.Literal('pattern'),
  Type.Literal('optimization'),
]);

const OutcomeEnum = Type.Union([
  Type.Literal('success'),
  Type.Literal('partial'),
  Type.Literal('failure'),
]);

const ErrorTypeEnum = Type.Union([
  Type.Literal('runtime'),
  Type.Literal('build'),
  Type.Literal('test'),
  Type.Literal('type'),
  Type.Literal('other'),
]);

const WarningTypeEnum = Type.Union([
  Type.Literal('file'),
  Type.Literal('package'),
]);

const SeverityEnum = Type.Union([
  Type.Literal('info'),
  Type.Literal('warn'),
  Type.Literal('block'),
]);

const EcosystemEnum = Type.Union([
  Type.Literal('npm'),
  Type.Literal('pip'),
  Type.Literal('cargo'),
  Type.Literal('go'),
]);

const SymbolKindEnum = Type.Union([
  Type.Literal('function'),
  Type.Literal('class'),
  Type.Literal('interface'),
  Type.Literal('type'),
  Type.Literal('enum'),
  Type.Literal('variable'),
  Type.Literal('const'),
  Type.Literal('method'),
  Type.Literal('property'),
]);

const PromptModeEnum = Type.Union([
  Type.Literal('interactive'),
  Type.Literal('auto'),
  Type.Literal('spawn'),
]);

// ============================================================================
// Tool Input Schemas
// ============================================================================

export const RecallInputSchema = Type.Object({
  query: Type.String({ description: 'What problem are you trying to solve?' }),
  limit: Type.Optional(Type.Number({ description: 'Max results (default: 5)' })),
  minScore: Type.Optional(Type.Number({
    minimum: 0,
    maximum: 1,
    description: 'Minimum similarity score 0-1 (default: 0.3)',
  })),
  scopeFilter: Type.Optional(Type.Union([ScopeFilterEnum], {
    description: 'Filter by solution scope (default: all)',
  })),
  categoryFilter: Type.Optional(Type.Union([CategoryEnum], {
    description: 'Filter by category',
  })),
  maxComplexity: Type.Optional(Type.Number({
    minimum: 1,
    maximum: 10,
    description: 'Only return solutions with complexity <= this value',
  })),
});

const CodeBlockSchema = Type.Object({
  language: Type.String(),
  code: Type.String(),
  description: Type.String(),
});

export const StoreInputSchema = Type.Object({
  problem: Type.String({ description: 'The problem that was solved' }),
  solution: Type.String({ description: 'The solution (code, steps, explanation)' }),
  scope: ScopeEnum,
  tags: Type.Optional(Type.Array(Type.String(), { description: 'Tags for categorization' })),
  filesAffected: Type.Optional(Type.Array(Type.String(), { description: 'Files that were modified' })),
  category: Type.Optional(CategoryEnum),
  complexity: Type.Optional(Type.Number({
    minimum: 1,
    maximum: 10,
    description: 'Complexity 1-10 (auto-calculated if not provided)',
  })),
  prerequisites: Type.Optional(Type.Array(Type.String(), { description: 'Conditions for this solution to apply' })),
  antiPatterns: Type.Optional(Type.Array(Type.String(), { description: 'What NOT to do' })),
  codeBlocks: Type.Optional(Type.Array(CodeBlockSchema, { description: 'Code snippets' })),
  relatedSolutions: Type.Optional(Type.Array(Type.String(), { description: 'IDs of related solutions' })),
  supersedes: Type.Optional(Type.String({ description: 'ID of solution this replaces' })),
});

export const RewardInputSchema = Type.Object({
  solutionId: Type.String({ description: 'ID of the solution (from matrix_recall)' }),
  outcome: OutcomeEnum,
  notes: Type.Optional(Type.String({ description: 'What worked or what needed to change' })),
});

export const FailureInputSchema = Type.Object({
  errorType: ErrorTypeEnum,
  errorMessage: Type.String(),
  stackTrace: Type.Optional(Type.String({ description: 'Stack trace if available' })),
  rootCause: Type.String({ description: 'What actually caused the error' }),
  fixApplied: Type.String({ description: 'How it was fixed' }),
  prevention: Type.Optional(Type.String({ description: 'How to avoid this in the future' })),
  filesInvolved: Type.Optional(Type.Array(Type.String())),
});

export const StatusInputSchema = Type.Object({});

export const WarnCheckInputSchema = Type.Object({
  type: WarningTypeEnum,
  target: Type.String({ description: 'File path or package name to check' }),
  ecosystem: Type.Optional(EcosystemEnum),
});

export const WarnAddInputSchema = Type.Object({
  type: WarningTypeEnum,
  target: Type.String({ description: 'File path (supports glob patterns like src/legacy/*) or package name' }),
  reason: Type.String({ description: 'Why this file/package is problematic' }),
  severity: Type.Optional(SeverityEnum),
  ecosystem: Type.Optional(EcosystemEnum),
  repoSpecific: Type.Optional(Type.Boolean({ description: 'If true, warning only applies to current repository' })),
});

export const WarnRemoveInputSchema = Type.Object({
  id: Type.Optional(Type.String({ description: 'Warning ID to remove' })),
  type: Type.Optional(WarningTypeEnum),
  target: Type.Optional(Type.String({ description: 'File path or package name (use with type)' })),
  ecosystem: Type.Optional(EcosystemEnum),
});

export const WarnListInputSchema = Type.Object({
  type: Type.Optional(WarningTypeEnum),
  repoOnly: Type.Optional(Type.Boolean({ description: 'If true, only show warnings specific to current repository' })),
});

export const PromptInputSchema = Type.Object({
  rawPrompt: Type.String({ description: 'The original user prompt to analyze' }),
  mode: Type.Optional(PromptModeEnum),
  skipClarification: Type.Optional(Type.Boolean({ description: 'If true, skip clarification questions and proceed with assumptions' })),
});

export const FindDefinitionInputSchema = Type.Object({
  symbol: Type.String({ description: 'The symbol name to find (e.g., "handleRequest", "UserService")' }),
  kind: Type.Optional(SymbolKindEnum),
  file: Type.Optional(Type.String({ description: 'Optional: limit search to a specific file path' })),
  repoPath: Type.Optional(Type.String({ description: 'Optional: path to repository to search (defaults to current directory)' })),
});

export const ListExportsInputSchema = Type.Object({
  path: Type.Optional(Type.String({ description: 'File or directory path to list exports from (e.g., "src/utils" or "src/index.ts")' })),
  repoPath: Type.Optional(Type.String({ description: 'Optional: path to repository to search (defaults to current directory)' })),
});

export const SearchSymbolsInputSchema = Type.Object({
  query: Type.String({ description: 'Partial symbol name to search for (e.g., "handle" finds "handleRequest", "handleError")' }),
  limit: Type.Optional(Type.Number({ description: 'Max results (default: 20)' })),
  repoPath: Type.Optional(Type.String({ description: 'Optional: path to repository to search (defaults to current directory)' })),
});

export const GetImportsInputSchema = Type.Object({
  file: Type.String({ description: 'File path to get imports from' }),
  repoPath: Type.Optional(Type.String({ description: 'Optional: path to repository (defaults to current directory)' })),
});

export const IndexStatusInputSchema = Type.Object({
  repoPath: Type.Optional(Type.String({ description: 'Optional: path to repository (defaults to current directory)' })),
});

export const ReindexInputSchema = Type.Object({
  full: Type.Optional(Type.Boolean({ description: 'Force full reindex, ignoring incremental mode (default: false)' })),
  repoPath: Type.Optional(Type.String({ description: 'Optional: path to repository to index (defaults to current directory)' })),
});

export const RepomixInputSchema = Type.Object({
  target: Type.String({ description: 'GitHub shorthand (owner/repo) or local path' }),
  query: Type.String({ description: 'What implementation are you looking for? Used for semantic search.' }),
  branch: Type.Optional(Type.String({ description: 'Git branch (default: HEAD/main)' })),
  confirmedFiles: Type.Optional(Type.Array(Type.String(), { description: 'Files to pack (from Phase 1 suggestions). Omit for Phase 1 index.' })),
  maxTokens: Type.Optional(Type.Number({ description: 'Maximum tokens for packed output (default: 30000)' })),
  maxFiles: Type.Optional(Type.Number({ description: 'Maximum files to suggest in Phase 1 (default: 15)' })),
  cacheTTLHours: Type.Optional(Type.Number({ description: 'Cache TTL in hours (default: 24)' })),
});

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type RecallInput = Static<typeof RecallInputSchema>;
export type StoreInput = Static<typeof StoreInputSchema>;
export type RewardInput = Static<typeof RewardInputSchema>;
export type FailureInput = Static<typeof FailureInputSchema>;
export type StatusInput = Static<typeof StatusInputSchema>;
export type WarnCheckInput = Static<typeof WarnCheckInputSchema>;
export type WarnAddInput = Static<typeof WarnAddInputSchema>;
export type WarnRemoveInput = Static<typeof WarnRemoveInputSchema>;
export type WarnListInput = Static<typeof WarnListInputSchema>;
export type PromptInput = Static<typeof PromptInputSchema>;
export type FindDefinitionInput = Static<typeof FindDefinitionInputSchema>;
export type ListExportsInput = Static<typeof ListExportsInputSchema>;
export type SearchSymbolsInput = Static<typeof SearchSymbolsInputSchema>;
export type GetImportsInput = Static<typeof GetImportsInputSchema>;
export type IndexStatusInput = Static<typeof IndexStatusInputSchema>;
export type ReindexInput = Static<typeof ReindexInputSchema>;
export type RepomixInput = Static<typeof RepomixInputSchema>;

// ============================================================================
// Compiled Validators
// ============================================================================

export const validators = {
  recall: TypeCompiler.Compile(RecallInputSchema),
  store: TypeCompiler.Compile(StoreInputSchema),
  reward: TypeCompiler.Compile(RewardInputSchema),
  failure: TypeCompiler.Compile(FailureInputSchema),
  status: TypeCompiler.Compile(StatusInputSchema),
  warnCheck: TypeCompiler.Compile(WarnCheckInputSchema),
  warnAdd: TypeCompiler.Compile(WarnAddInputSchema),
  warnRemove: TypeCompiler.Compile(WarnRemoveInputSchema),
  warnList: TypeCompiler.Compile(WarnListInputSchema),
  prompt: TypeCompiler.Compile(PromptInputSchema),
  findDefinition: TypeCompiler.Compile(FindDefinitionInputSchema),
  listExports: TypeCompiler.Compile(ListExportsInputSchema),
  searchSymbols: TypeCompiler.Compile(SearchSymbolsInputSchema),
  getImports: TypeCompiler.Compile(GetImportsInputSchema),
  indexStatus: TypeCompiler.Compile(IndexStatusInputSchema),
  reindex: TypeCompiler.Compile(ReindexInputSchema),
  repomix: TypeCompiler.Compile(RepomixInputSchema),
} as const;

// ============================================================================
// Validation Helpers
// ============================================================================

export class ValidationError extends Error {
  constructor(
    public readonly errors: Array<{ path: string; message: string }>,
  ) {
    const messages = errors.map((e) => `${e.path}: ${e.message}`).join(', ');
    super(`Validation failed: ${messages}`);
    this.name = 'ValidationError';
  }
}

/**
 * Validate input and return typed result, or throw ValidationError
 */
export function validate<T>(
  validator: TypeCheck<ReturnType<typeof Type.Object>>,
  input: unknown,
): T {
  if (validator.Check(input)) {
    return input as T;
  }

  const errors: Array<{ path: string; message: string }> = [];
  for (const error of validator.Errors(input)) {
    errors.push({
      path: error.path,
      message: error.message,
    });
  }

  throw new ValidationError(errors);
}

/**
 * Safe validation that returns a Result-like object
 */
export function validateSafe<T>(
  validator: TypeCheck<ReturnType<typeof Type.Object>>,
  input: unknown,
): { success: true; data: T } | { success: false; errors: Array<{ path: string; message: string }> } {
  if (validator.Check(input)) {
    return { success: true, data: input as T };
  }

  const errors: Array<{ path: string; message: string }> = [];
  for (const error of validator.Errors(input)) {
    errors.push({
      path: error.path,
      message: error.message,
    });
  }

  return { success: false, errors };
}
