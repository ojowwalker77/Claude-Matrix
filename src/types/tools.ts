// Tool input types
export interface RecallInput {
  query: string;
  limit?: number;
  minScore?: number;
  scopeFilter?: 'all' | 'repo' | 'stack' | 'global';
}

export interface StoreInput {
  problem: string;
  solution: string;
  scope: 'global' | 'stack' | 'repo';
  tags?: string[];
  filesAffected?: string[];
}

export interface RewardInput {
  solutionId: string;
  outcome: 'success' | 'partial' | 'failure';
  notes?: string;
}

export interface FailureInput {
  errorType: 'runtime' | 'build' | 'test' | 'type' | 'other';
  errorMessage: string;
  stackTrace?: string;
  rootCause: string;
  fixApplied: string;
  prevention?: string;
  filesInvolved?: string[];
}

// Tool output types
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
