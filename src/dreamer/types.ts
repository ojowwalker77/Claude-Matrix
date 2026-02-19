/**
 * Dreamer - Scheduled Task Automation Types
 *
 * Internal types for the scheduler system.
 * Public API types are defined in tools/validation.ts
 */

// ============================================================================
// Task Configuration
// ============================================================================

/**
 * Worktree configuration for isolated execution
 */
export interface WorktreeConfig {
  enabled: boolean;
  basePath?: string;
  branchPrefix: string;
  remoteName: string;
}

/**
 * Scheduled task from database
 */
export interface DreamerTask {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  cronExpression: string;
  timezone: string;
  command: string;
  workingDirectory: string;
  timeout: number;
  env: Record<string, string>;
  skipPermissions: boolean;
  worktreeEnabled: boolean;
  worktreeBasePath?: string;
  worktreeBranchPrefix: string;
  worktreeRemote: string;
  tags: string[];
  repoId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Task as stored in SQLite (raw row format)
 */
export interface DreamerTaskRow {
  id: string;
  name: string;
  description: string | null;
  enabled: number; // SQLite boolean
  cron_expression: string;
  timezone: string;
  command: string;
  working_directory: string;
  timeout: number;
  env: string; // JSON
  skip_permissions: number; // SQLite boolean
  worktree_enabled: number; // SQLite boolean
  worktree_base_path: string | null;
  worktree_branch_prefix: string;
  worktree_remote: string;
  tags: string; // JSON
  repo_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Execution Records
// ============================================================================

/**
 * Execution status values
 */
export type ExecutionStatus = 'running' | 'success' | 'failure' | 'timeout' | 'skipped';

/**
 * Execution record from database
 */
export interface DreamerExecution {
  id: string;
  taskId: string;
  startedAt: string;
  completedAt?: string;
  status: ExecutionStatus;
  triggeredBy: string;
  duration?: number;
  exitCode?: number;
  outputPreview?: string;
  error?: string;
  taskName: string;
  projectPath?: string;
  cronExpression?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  worktreePushed?: boolean;
}

/**
 * Execution as stored in SQLite (raw row format)
 */
export interface DreamerExecutionRow {
  id: string;
  task_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  triggered_by: string;
  duration: number | null;
  exit_code: number | null;
  output_preview: string | null;
  error: string | null;
  task_name: string;
  project_path: string | null;
  cron_expression: string | null;
  worktree_path: string | null;
  worktree_branch: string | null;
  worktree_pushed: number | null; // SQLite boolean
}

// ============================================================================
// Scheduler Status
// ============================================================================

/**
 * Status of the native OS scheduler
 */
export interface SchedulerStatus {
  healthy: boolean;
  taskCount: number;
  errors: string[];
  platform: 'darwin' | 'linux';
}

// ============================================================================
// Conversion Helpers
// ============================================================================

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  try { return json ? JSON.parse(json) : fallback; } catch { return fallback; }
}

/**
 * Convert database row to DreamerTask
 */
export function rowToTask(row: DreamerTaskRow): DreamerTask {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    enabled: row.enabled === 1,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
    command: row.command,
    workingDirectory: row.working_directory,
    timeout: row.timeout,
    env: safeJsonParse(row.env, {}),
    skipPermissions: row.skip_permissions === 1,
    worktreeEnabled: row.worktree_enabled === 1,
    worktreeBasePath: row.worktree_base_path ?? undefined,
    worktreeBranchPrefix: row.worktree_branch_prefix,
    worktreeRemote: row.worktree_remote,
    tags: safeJsonParse(row.tags, []),
    repoId: row.repo_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Valid execution status values for runtime validation
const VALID_STATUSES: ExecutionStatus[] = ['running', 'success', 'failure', 'timeout', 'skipped'];

/**
 * Convert database row to DreamerExecution
 */
export function rowToExecution(row: DreamerExecutionRow): DreamerExecution {
  // Validate status at runtime - fallback to 'failure' if invalid
  const status: ExecutionStatus = VALID_STATUSES.includes(row.status as ExecutionStatus)
    ? (row.status as ExecutionStatus)
    : 'failure';

  return {
    id: row.id,
    taskId: row.task_id,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    status,
    triggeredBy: row.triggered_by,
    duration: row.duration ?? undefined,
    exitCode: row.exit_code ?? undefined,
    outputPreview: row.output_preview ?? undefined,
    error: row.error ?? undefined,
    taskName: row.task_name,
    projectPath: row.project_path ?? undefined,
    cronExpression: row.cron_expression ?? undefined,
    worktreePath: row.worktree_path ?? undefined,
    worktreeBranch: row.worktree_branch ?? undefined,
    worktreePushed: row.worktree_pushed === 1 ? true : row.worktree_pushed === 0 ? false : undefined,
  };
}
