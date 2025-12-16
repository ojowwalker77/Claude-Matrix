export interface RepoFingerprint {
  id: string;
  name: string;
  path: string | null;
  languages: string[];
  frameworks: string[];
  dependencies: string[];
  patterns: string[];
  testFramework: string | null;
}

export interface Solution {
  id: string;
  repoId: string | null;
  problem: string;
  solution: string;
  scope: 'global' | 'stack' | 'repo';
  context: SolutionContext;
  tags: string[];
  score: number;
  uses: number;
  successes: number;
  partialSuccesses: number;
  failures: number;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
}

export interface SolutionContext {
  filesAffected?: string[];
  language?: string;
  framework?: string;
}

export interface Failure {
  id: string;
  repoId: string | null;
  errorType: 'runtime' | 'build' | 'test' | 'type' | 'other';
  errorMessage: string;
  errorSignature: string;
  stackTrace: string | null;
  filesInvolved: string[];
  recentChanges: string | null;
  rootCause: string | null;
  fixApplied: string | null;
  prevention: string | null;
  occurrences: number;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface UsageLog {
  id: number;
  solutionId: string;
  repoId: string | null;
  outcome: 'success' | 'partial' | 'failure' | 'skipped';
  notes: string | null;
  createdAt: Date;
}

export interface RecallResult {
  id: string;
  problem: string;
  solution: string;
  relevance: {
    score: number;
    semanticScore: number;
    contextBonus: number;
    reason: 'same_repo' | 'similar_stack' | 'global';
  };
  stats: {
    uses: number;
    successRate: number;
    lastUsed: string | null;
  };
  sourceRepo: {
    name: string;
    similarity: number;
  };
  tags: string[];
  warning: string | null;
}

export interface FailureMatch {
  id: string;
  errorType: string;
  errorMessage: string;
  rootCause: string | null;
  fixApplied: string | null;
  prevention: string | null;
  similarity: number;
}

export interface MatrixStatus {
  currentRepo: {
    id: string;
    name: string;
    solutionsCount: number;
    failuresCount: number;
  } | null;
  global: {
    totalSolutions: number;
    totalFailures: number;
    totalRepos: number;
    topTags: string[];
  };
  recentActivity: Array<{
    type: 'recall' | 'store' | 'reward' | 'failure';
    description: string;
    timestamp: string;
  }>;
}
