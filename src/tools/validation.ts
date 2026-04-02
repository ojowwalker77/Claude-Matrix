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

// ============================================================================
// Analysis Enums
// ============================================================================

const DeadCodeCategoryEnum = Type.Union([
  Type.Literal('dead_exports'),
  Type.Literal('orphaned_files'),
  Type.Literal('all'),
]);

// ============================================================================
// Tool Input Schemas
// ============================================================================

export const RecallInputSchema = Type.Object({
  query: Type.String({ description: 'Problem to solve' }),
  limit: Type.Optional(Type.Number({ description: 'Max results' })),
  minScore: Type.Optional(Type.Number({ minimum: 0, maximum: 1, description: 'Min similarity 0-1' })),
  scopeFilter: Type.Optional(ScopeFilterEnum),
  categoryFilter: Type.Optional(CategoryEnum),
  maxComplexity: Type.Optional(Type.Number({ minimum: 1, maximum: 10, description: 'Max complexity filter' })),
  compact: Type.Optional(Type.Boolean({ description: 'Return compact results (id, problem, similarity, score)' })),
  includeHints: Type.Optional(Type.Boolean({ description: 'Include usage hints (default: true)' })),
});

const CodeBlockSchema = Type.Object({
  language: Type.String(),
  code: Type.String(),
  description: Type.String(),
});

export const StoreInputSchema = Type.Object({
  problem: Type.String({ description: 'Problem solved' }),
  solution: Type.String({ description: 'Solution (code, steps, explanation)' }),
  scope: ScopeEnum,
  tags: Type.Optional(Type.Array(Type.String(), { description: 'Tags' })),
  filesAffected: Type.Optional(Type.Array(Type.String(), { description: 'Modified files' })),
  category: Type.Optional(CategoryEnum),
  complexity: Type.Optional(Type.Number({ minimum: 1, maximum: 10, description: 'Complexity 1-10' })),
  prerequisites: Type.Optional(Type.Array(Type.String(), { description: 'Required conditions' })),
  antiPatterns: Type.Optional(Type.Array(Type.String(), { description: 'What NOT to do' })),
  codeBlocks: Type.Optional(Type.Array(CodeBlockSchema, { description: 'Code snippets' })),
  relatedSolutions: Type.Optional(Type.Array(Type.String(), { description: 'Related solution IDs' })),
  supersedes: Type.Optional(Type.String({ description: 'Superseded solution ID' })),
  includeHints: Type.Optional(Type.Boolean({ description: 'Include usage hints (default: true)' })),
});

export const RewardInputSchema = Type.Object({
  solutionId: Type.String({ description: 'Solution ID from matrix_recall' }),
  outcome: OutcomeEnum,
  notes: Type.Optional(Type.String({ description: 'What worked or needed change' })),
});

export const GetSolutionInputSchema = Type.Object({
  solutionId: Type.String({ description: 'Solution ID to fetch' }),
});

export const FailureInputSchema = Type.Object({
  errorType: ErrorTypeEnum,
  errorMessage: Type.String(),
  stackTrace: Type.Optional(Type.String({ description: 'Stack trace' })),
  rootCause: Type.String({ description: 'Root cause' }),
  fixApplied: Type.String({ description: 'Fix applied' }),
  prevention: Type.Optional(Type.String({ description: 'Prevention strategy' })),
  filesInvolved: Type.Optional(Type.Array(Type.String())),
  includeHints: Type.Optional(Type.Boolean({ description: 'Include usage hints (default: true)' })),
});

export const StatusInputSchema = Type.Object({});

// v2.0 Unified Warn Schema
const WarnActionEnum = Type.Union([
  Type.Literal('check'),
  Type.Literal('add'),
  Type.Literal('remove'),
  Type.Literal('list'),
]);

export const WarnInputSchema = Type.Object({
  action: WarnActionEnum,
  type: Type.Optional(WarningTypeEnum),
  target: Type.Optional(Type.String({ description: 'File path/glob or package name' })),
  reason: Type.Optional(Type.String({ description: 'Why problematic (for add)' })),
  severity: Type.Optional(SeverityEnum),
  ecosystem: Type.Optional(EcosystemEnum),
  id: Type.Optional(Type.String({ description: 'Warning ID (for remove)' })),
  repoOnly: Type.Optional(Type.Boolean({ description: 'Repo-specific only (for list)' })),
  repoSpecific: Type.Optional(Type.Boolean({ description: 'Repo-specific warning (for add)' })),
});

// Shared description for repoPath - remove redundancy
const repoPathDesc = 'Repository path';

export const FindDefinitionInputSchema = Type.Object({
  symbol: Type.String({ description: 'Symbol name (e.g., "handleRequest")' }),
  kind: Type.Optional(SymbolKindEnum),
  file: Type.Optional(Type.String({ description: 'Limit to file' })),
  repoPath: Type.Optional(Type.String({ description: repoPathDesc })),
});

export const FindCallersInputSchema = Type.Object({
  symbol: Type.String({ description: 'Symbol to find callers of' }),
  file: Type.Optional(Type.String({ description: 'File where symbol is defined' })),
  repoPath: Type.Optional(Type.String({ description: repoPathDesc })),
});

export const ListExportsInputSchema = Type.Object({
  path: Type.Optional(Type.String({ description: 'File or directory path' })),
  repoPath: Type.Optional(Type.String({ description: repoPathDesc })),
});

export const SearchSymbolsInputSchema = Type.Object({
  query: Type.String({ description: 'Partial symbol name' }),
  limit: Type.Optional(Type.Number({ description: 'Max results' })),
  repoPath: Type.Optional(Type.String({ description: repoPathDesc })),
});

export const GetImportsInputSchema = Type.Object({
  file: Type.String({ description: 'File path' }),
  repoPath: Type.Optional(Type.String({ description: repoPathDesc })),
});

export const IndexStatusInputSchema = Type.Object({
  repoPath: Type.Optional(Type.String({ description: repoPathDesc })),
});

export const ReindexInputSchema = Type.Object({
  full: Type.Optional(Type.Boolean({ description: 'Force full reindex' })),
  repoPath: Type.Optional(Type.String({ description: repoPathDesc })),
});

export const DoctorInputSchema = Type.Object({
  autoFix: Type.Optional(Type.Boolean({ description: 'Auto-fix issues' })),
});

export const FindDeadCodeInputSchema = Type.Object({
  category: Type.Optional(DeadCodeCategoryEnum),
  path: Type.Optional(Type.String({ description: 'Limit analysis to path prefix (e.g., "src/")' })),
  entryPoints: Type.Optional(Type.Array(Type.String(), { description: 'Known entry point globs to exclude' })),
  limit: Type.Optional(Type.Number({ description: 'Max results per category (default: 100)' })),
  repoPath: Type.Optional(Type.String({ description: repoPathDesc })),
});

export const FindCircularDepsInputSchema = Type.Object({
  path: Type.Optional(Type.String({ description: 'Limit analysis to path prefix' })),
  maxDepth: Type.Optional(Type.Number({ description: 'Max cycle depth to detect (default: 10)' })),
  repoPath: Type.Optional(Type.String({ description: repoPathDesc })),
});

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type RecallInput = Static<typeof RecallInputSchema>;
export type StoreInput = Static<typeof StoreInputSchema>;
export type RewardInput = Static<typeof RewardInputSchema>;
export type GetSolutionInput = Static<typeof GetSolutionInputSchema>;
export type FailureInput = Static<typeof FailureInputSchema>;
export type StatusInput = Static<typeof StatusInputSchema>;
export type WarnInput = Static<typeof WarnInputSchema>;
export type FindDefinitionInput = Static<typeof FindDefinitionInputSchema>;
export type FindCallersInput = Static<typeof FindCallersInputSchema>;
export type ListExportsInput = Static<typeof ListExportsInputSchema>;
export type SearchSymbolsInput = Static<typeof SearchSymbolsInputSchema>;
export type GetImportsInput = Static<typeof GetImportsInputSchema>;
export type IndexStatusInput = Static<typeof IndexStatusInputSchema>;
export type ReindexInput = Static<typeof ReindexInputSchema>;
export type DoctorInput = Static<typeof DoctorInputSchema>;
export type FindDeadCodeInput = Static<typeof FindDeadCodeInputSchema>;
export type FindCircularDepsInput = Static<typeof FindCircularDepsInputSchema>;

// ============================================================================
// Compiled Validators
// ============================================================================

export const validators = {
  recall: TypeCompiler.Compile(RecallInputSchema),
  store: TypeCompiler.Compile(StoreInputSchema),
  reward: TypeCompiler.Compile(RewardInputSchema),
  getSolution: TypeCompiler.Compile(GetSolutionInputSchema),
  failure: TypeCompiler.Compile(FailureInputSchema),
  status: TypeCompiler.Compile(StatusInputSchema),
  warn: TypeCompiler.Compile(WarnInputSchema),
  findDefinition: TypeCompiler.Compile(FindDefinitionInputSchema),
  findCallers: TypeCompiler.Compile(FindCallersInputSchema),
  listExports: TypeCompiler.Compile(ListExportsInputSchema),
  searchSymbols: TypeCompiler.Compile(SearchSymbolsInputSchema),
  getImports: TypeCompiler.Compile(GetImportsInputSchema),
  indexStatus: TypeCompiler.Compile(IndexStatusInputSchema),
  reindex: TypeCompiler.Compile(ReindexInputSchema),
  doctor: TypeCompiler.Compile(DoctorInputSchema),
  findDeadCode: TypeCompiler.Compile(FindDeadCodeInputSchema),
  findCircularDeps: TypeCompiler.Compile(FindCircularDepsInputSchema),
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
