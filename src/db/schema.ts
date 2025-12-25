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
    last_used_at TEXT
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

-- Indexes for hooks tables
CREATE INDEX IF NOT EXISTS idx_warnings_type_target ON warnings(type, target);
CREATE INDEX IF NOT EXISTS idx_warnings_repo ON warnings(repo_id);
CREATE INDEX IF NOT EXISTS idx_dep_installs_package ON dependency_installs(package_name);
CREATE INDEX IF NOT EXISTS idx_dep_installs_session ON dependency_installs(session_id);
CREATE INDEX IF NOT EXISTS idx_dep_installs_repo ON dependency_installs(repo_id);
CREATE INDEX IF NOT EXISTS idx_session_summaries_session ON session_summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_api_cache_created ON api_cache(created_at);
`;
