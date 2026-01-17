export const SCHEMA_SQL = `
-- Claude Matrix - Tooling System Schema

-- Repositórios conhecidos
CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT,
    languages JSON NOT NULL DEFAULT '[]',
    frameworks JSON NOT NULL DEFAULT '[]',
    dependencies JSON NOT NULL DEFAULT '[]',
    patterns JSON NOT NULL DEFAULT '[]',
    test_framework TEXT,
    fingerprint_embedding BLOB,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Soluções aprendidas
CREATE TABLE IF NOT EXISTS solutions (
    id TEXT PRIMARY KEY,
    repo_id TEXT REFERENCES repos(id),
    problem TEXT NOT NULL,
    problem_embedding BLOB NOT NULL,
    solution TEXT NOT NULL,
    scope TEXT NOT NULL CHECK(scope IN ('global', 'stack', 'repo')),
    context JSON NOT NULL DEFAULT '{}',
    tags JSON DEFAULT '[]',
    score REAL DEFAULT 0.5,
    uses INTEGER DEFAULT 0,
    successes INTEGER DEFAULT 0,
    partial_successes INTEGER DEFAULT 0,
    failures INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT,
    -- v1.0.1 Enhanced metadata
    category TEXT CHECK(category IN ('bugfix', 'feature', 'refactor', 'config', 'pattern', 'optimization')),
    complexity INTEGER CHECK(complexity >= 1 AND complexity <= 10),
    prerequisites JSON DEFAULT '[]',
    anti_patterns JSON DEFAULT '[]',
    code_blocks JSON DEFAULT '[]',
    related_solutions JSON DEFAULT '[]',
    supersedes TEXT REFERENCES solutions(id),
    -- v2.0 Skill Factory
    promoted_to_skill TEXT,          -- path to skill file if promoted
    promoted_at TEXT                  -- timestamp of promotion
);

-- Falhas registradas
CREATE TABLE IF NOT EXISTS failures (
    id TEXT PRIMARY KEY,
    repo_id TEXT REFERENCES repos(id),
    error_type TEXT NOT NULL CHECK(error_type IN ('runtime', 'build', 'test', 'type', 'other')),
    error_message TEXT NOT NULL,
    error_signature TEXT NOT NULL,
    error_embedding BLOB NOT NULL,
    stack_trace TEXT,
    files_involved JSON DEFAULT '[]',
    recent_changes TEXT,
    root_cause TEXT,
    fix_applied TEXT,
    prevention TEXT,
    occurrences INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT
);

-- Histórico de uso
CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solution_id TEXT REFERENCES solutions(id),
    repo_id TEXT REFERENCES repos(id),
    outcome TEXT CHECK(outcome IN ('success', 'partial', 'failure', 'skipped')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for core tables
CREATE INDEX IF NOT EXISTS idx_solutions_repo ON solutions(repo_id);
CREATE INDEX IF NOT EXISTS idx_solutions_scope ON solutions(scope);
CREATE INDEX IF NOT EXISTS idx_solutions_score ON solutions(score DESC);
CREATE INDEX IF NOT EXISTS idx_solutions_scope_score ON solutions(scope, score DESC);
CREATE INDEX IF NOT EXISTS idx_solutions_created ON solutions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solutions_category ON solutions(category);
CREATE INDEX IF NOT EXISTS idx_solutions_complexity ON solutions(complexity);
CREATE INDEX IF NOT EXISTS idx_solutions_supersedes ON solutions(supersedes);
CREATE INDEX IF NOT EXISTS idx_failures_repo ON failures(repo_id);
CREATE INDEX IF NOT EXISTS idx_failures_signature ON failures(error_signature);
CREATE INDEX IF NOT EXISTS idx_failures_type ON failures(error_type);
CREATE INDEX IF NOT EXISTS idx_usage_solution ON usage_log(solution_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log(created_at DESC);

-- ============================================================================
-- Hooks Integration Tables (Ciclo de Interação Matrix v1)
-- ============================================================================

-- Warnings for files and packages (personal grudges)
CREATE TABLE IF NOT EXISTS warnings (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('file', 'package')),
    target TEXT NOT NULL,               -- file path pattern or package name
    ecosystem TEXT,                     -- npm, pip, cargo, go (for packages)
    reason TEXT NOT NULL,
    severity TEXT DEFAULT 'warn' CHECK(severity IN ('info', 'warn', 'block')),
    repo_id TEXT REFERENCES repos(id),  -- if repo-specific (NULL = global)
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(type, target, ecosystem, repo_id)
);

-- Track dependency installations
CREATE TABLE IF NOT EXISTS dependency_installs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_name TEXT NOT NULL,
    package_version TEXT,
    ecosystem TEXT NOT NULL CHECK(ecosystem IN ('npm', 'pip', 'cargo', 'go')),
    repo_id TEXT REFERENCES repos(id),
    command TEXT NOT NULL,
    session_id TEXT,
    cve_cache JSON,                     -- cached OSV result
    size_bytes INTEGER,
    deprecated INTEGER DEFAULT 0,       -- SQLite boolean
    installed_at TEXT DEFAULT (datetime('now'))
);

-- Session summaries for Stop hook
CREATE TABLE IF NOT EXISTS session_summaries (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    repo_id TEXT REFERENCES repos(id),
    summary TEXT,
    complexity INTEGER,
    stored_solution_id TEXT REFERENCES solutions(id),
    user_decision TEXT CHECK(user_decision IN ('stored', 'skipped', 'edited')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- API response cache (24h TTL)
CREATE TABLE IF NOT EXISTS api_cache (
    cache_key TEXT PRIMARY KEY,         -- e.g., "osv:lodash" or "bundlephobia:react"
    response JSON NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Track one-time hook executions per session
CREATE TABLE IF NOT EXISTS hook_executions (
    hook_name TEXT NOT NULL,
    session_id TEXT NOT NULL,
    executed_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (hook_name, session_id)
);

-- Background job tracking for async operations
CREATE TABLE IF NOT EXISTS background_jobs (
    id TEXT PRIMARY KEY,
    tool_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    progress_percent INTEGER DEFAULT 0,
    progress_message TEXT,
    input JSON,
    result JSON,
    error TEXT,
    pid INTEGER,                        -- process ID for orphan cleanup
    created_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT
);

-- Indexes for hooks tables
CREATE INDEX IF NOT EXISTS idx_warnings_type_target ON warnings(type, target);
CREATE INDEX IF NOT EXISTS idx_warnings_repo ON warnings(repo_id);
CREATE INDEX IF NOT EXISTS idx_dep_installs_package ON dependency_installs(package_name);
CREATE INDEX IF NOT EXISTS idx_dep_installs_session ON dependency_installs(session_id);
CREATE INDEX IF NOT EXISTS idx_dep_installs_repo ON dependency_installs(repo_id);
CREATE INDEX IF NOT EXISTS idx_session_summaries_session ON session_summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_api_cache_created ON api_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_hook_executions_session ON hook_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_tool ON background_jobs(tool_name);

-- ============================================================================
-- Code Indexer Tables (Repository Symbol Index)
-- ============================================================================

-- Track indexed files and their state
CREATE TABLE IF NOT EXISTS repo_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT NOT NULL,
    file_path TEXT NOT NULL,           -- relative to repo root
    mtime INTEGER NOT NULL,            -- file modification time (unix timestamp)
    hash TEXT,                         -- content hash for dedup
    indexed_at TEXT DEFAULT (datetime('now')),
    UNIQUE(repo_id, file_path)
    -- No FK: repo_id may be a hash-based ID without full repos entry
);

-- Symbol index (functions, classes, variables, types)
CREATE TABLE IF NOT EXISTS symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT NOT NULL,
    file_id INTEGER NOT NULL,
    name TEXT NOT NULL,                -- symbol name
    kind TEXT NOT NULL,                -- 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'const'
    line INTEGER NOT NULL,             -- definition line (1-indexed)
    column INTEGER NOT NULL,           -- definition column (0-indexed)
    end_line INTEGER,                  -- end of definition
    exported INTEGER DEFAULT 0,        -- is it exported? (SQLite boolean)
    is_default INTEGER DEFAULT 0,      -- is default export?
    scope TEXT,                        -- parent scope (class name, module, etc.)
    signature TEXT,                    -- function signature or type info
    FOREIGN KEY (file_id) REFERENCES repo_files(id) ON DELETE CASCADE
);

-- Import statements in files
CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    imported_name TEXT NOT NULL,       -- what's being imported
    local_name TEXT,                   -- local alias (if renamed)
    source_path TEXT NOT NULL,         -- from './foo' or 'lodash'
    is_default INTEGER DEFAULT 0,      -- is default import?
    is_namespace INTEGER DEFAULT 0,    -- is namespace import (import * as)?
    is_type INTEGER DEFAULT 0,         -- is type-only import?
    line INTEGER NOT NULL,
    FOREIGN KEY (file_id) REFERENCES repo_files(id) ON DELETE CASCADE
);

-- References (where symbols are used) - optional, for find_references
CREATE TABLE IF NOT EXISTS symbol_refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol_id INTEGER NOT NULL,
    file_id INTEGER NOT NULL,
    line INTEGER NOT NULL,
    column INTEGER NOT NULL,
    FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES repo_files(id) ON DELETE CASCADE
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_repo_files_repo ON repo_files(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_files_path ON repo_files(repo_id, file_path);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_repo ON symbols(repo_id);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_symbols_exported ON symbols(exported);
CREATE INDEX IF NOT EXISTS idx_imports_file ON imports(file_id);
CREATE INDEX IF NOT EXISTS idx_imports_source ON imports(source_path);
CREATE INDEX IF NOT EXISTS idx_imports_name ON imports(imported_name);
CREATE INDEX IF NOT EXISTS idx_symbol_refs_symbol ON symbol_refs(symbol_id);
CREATE INDEX IF NOT EXISTS idx_symbol_refs_file ON symbol_refs(file_id);

-- ============================================================================
-- Dreamer Tables (Scheduled Task Automation)
-- ============================================================================

-- Scheduled task definitions
CREATE TABLE IF NOT EXISTS dreamer_tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER DEFAULT 1,
    cron_expression TEXT NOT NULL,
    timezone TEXT DEFAULT 'local',
    command TEXT NOT NULL,
    working_directory TEXT DEFAULT '.',
    timeout INTEGER DEFAULT 300,
    env JSON DEFAULT '{}',
    skip_permissions INTEGER DEFAULT 0,
    worktree_enabled INTEGER DEFAULT 0,
    worktree_base_path TEXT,
    worktree_branch_prefix TEXT DEFAULT 'claude-task/',
    worktree_remote TEXT DEFAULT 'origin',
    tags JSON DEFAULT '[]',
    repo_id TEXT REFERENCES repos(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Execution history for scheduled tasks
CREATE TABLE IF NOT EXISTS dreamer_executions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES dreamer_tasks(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL CHECK(status IN ('running','success','failure','timeout','skipped')),
    triggered_by TEXT NOT NULL,
    duration INTEGER,
    exit_code INTEGER,
    output_preview TEXT,
    error TEXT,
    task_name TEXT NOT NULL,
    project_path TEXT,
    cron_expression TEXT,
    worktree_path TEXT,
    worktree_branch TEXT,
    worktree_pushed INTEGER
);

-- Indexes for dreamer tables
CREATE INDEX IF NOT EXISTS idx_dreamer_tasks_repo ON dreamer_tasks(repo_id);
CREATE INDEX IF NOT EXISTS idx_dreamer_tasks_enabled ON dreamer_tasks(enabled);
CREATE INDEX IF NOT EXISTS idx_dreamer_executions_task ON dreamer_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_dreamer_executions_started ON dreamer_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_dreamer_executions_status ON dreamer_executions(status);
`;
