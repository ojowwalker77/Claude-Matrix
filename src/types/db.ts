// Database row types
export interface SolutionRow {
  id: string;
  repo_id: string | null;
  problem: string;
  problem_embedding: Uint8Array | null;
  solution: string;
  scope: 'global' | 'stack' | 'repo';
  context: string;
  tags: string;
  score: number;
  uses: number;
  successes: number;
  partial_successes: number;
  failures: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export interface FailureRow {
  id: string;
  repo_id: string | null;
  error_type: 'runtime' | 'build' | 'test' | 'type' | 'other';
  error_message: string;
  error_signature: string;
  error_embedding: Uint8Array | null;
  stack_trace: string | null;
  files_involved: string;
  recent_changes: string | null;
  root_cause: string | null;
  fix_applied: string | null;
  prevention: string | null;
  occurrences: number;
  created_at: string;
  resolved_at: string | null;
}

export interface RepoRow {
  id: string;
  name: string;
  path: string | null;
  fingerprint: string;
  fingerprint_embedding: Uint8Array | null;
  languages: string;
  frameworks: string;
  dependencies: string;
  patterns: string;
  test_framework: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageLogRow {
  id: number;
  solution_id: string;
  repo_id: string | null;
  outcome: 'success' | 'partial' | 'failure' | 'skipped';
  notes: string | null;
  created_at: string;
}
