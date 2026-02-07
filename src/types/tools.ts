/**
 * Tool Types
 *
 * Re-exports from validation.ts for backward compatibility.
 * New code should import directly from validation.ts.
 */

// Re-export input types from validation (source of truth)
export type {
  RecallInput,
  StoreInput,
  RewardInput,
  FailureInput,
  WarnInput,  // v2.0: Consolidated warn tool input
  PromptInput,
  FindDefinitionInput,
  FindCallersInput,  // v2.0: New callers tool
  ListExportsInput,
  SearchSymbolsInput,
  GetImportsInput,
  IndexStatusInput,
  ReindexInput,
} from '../tools/validation.js';

// Re-export warn result types (for hooks)
export type {
  WarnCheckResult,
  WarnAddResult,
  WarnRemoveResult,
  WarnListResult,
} from '../tools/warn.js';

// Tool output types (kept here as they're not part of validation)
export interface SolutionMatch {
  id: string;
  problem: string;
  solution: string;
  scope: string;
  tags: string[];
  similarity: number;
  score: number;
  uses: number;
  successRate: number;
}

export interface RecallResult {
  query: string;
  solutions: SolutionMatch[];
  totalFound: number;
}

export interface StoreResult {
  id: string;
  status: 'stored';
  problem: string;
  scope: string;
  tags: string[];
}

export interface RewardResult {
  solutionId: string;
  outcome: string;
  previousScore: number;
  newScore: number;
  message: string;
}

export interface FailureResult {
  id: string;
  status: 'recorded' | 'updated';
  errorType: string;
  occurrences: number;
  message: string;
}

export interface FailureMatch {
  id: string;
  errorType: string;
  errorMessage: string;
  rootCause: string;
  fixApplied: string;
  similarity: number;
}

export interface StatusResult {
  status: string;
  database: string;
  stats: {
    solutions: number;
    failures: number;
    repos: number;
  };
  topTags: string[];
  recentSolutions: Array<{
    id: string;
    problem: string;
    scope: string;
    score: number;
    created_at: string;
  }>;
}

// Scope type
export type Scope = 'global' | 'stack' | 'repo';
export type ScopeFilter = Scope | 'all';
export type ErrorType = 'runtime' | 'build' | 'test' | 'type' | 'other';
export type Outcome = 'success' | 'partial' | 'failure';
