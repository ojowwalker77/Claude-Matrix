import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { SCHEMA_SQL } from './schema.js';

// Schema version - increment when schema changes
export const SCHEMA_VERSION = 9;

function getDbPath(): string {
  return process.env['MATRIX_DB'] || join(homedir(), '.claude', 'matrix', 'matrix.db');
}

/**
 * Detect current schema version.
 * - Has schema_version table → read it
 * - Has solutions table but no schema_version → legacy DB (return 1)
 * - Empty DB → fresh (return 0)
 */
function getCurrentVersion(db: Database): number {
  try {
    const hasVersionTable = db.query(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'
    `).get();

    if (hasVersionTable) {
      const row = db.query('SELECT MAX(version) as version FROM schema_version').get() as { version: number } | null;
      return row?.version || 0;
    }

    // No version table — check if this is an existing DB
    const hasSolutions = db.query(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='solutions'
    `).get();

    if (hasSolutions) {
      // Legacy DB without version tracking — create the table and mark as v1
      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec('INSERT INTO schema_version (version) VALUES (1)');
      return 1;
    }

    // Fresh DB
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Check if a column exists on a table
 */
function hasColumn(db: Database, table: string, column: string): boolean {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some(c => c.name === column);
}

/**
 * Single idempotent migration that brings any legacy DB (v1-v8) to v9.
 * Uses IF NOT EXISTS / column checks so it's safe to run on any version.
 */
function runLegacyUpgrade(db: Database): void {
  // ── Create tables that may be missing ──────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS warnings (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('file', 'package')),
      target TEXT NOT NULL,
      ecosystem TEXT,
      reason TEXT NOT NULL,
      severity TEXT DEFAULT 'warn' CHECK(severity IN ('info', 'warn', 'block')),
      repo_id TEXT REFERENCES repos(id),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(type, target, ecosystem, repo_id)
    );

    CREATE TABLE IF NOT EXISTS dependency_installs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_name TEXT NOT NULL,
      package_version TEXT,
      ecosystem TEXT NOT NULL CHECK(ecosystem IN ('npm', 'pip', 'cargo', 'go')),
      repo_id TEXT REFERENCES repos(id),
      command TEXT NOT NULL,
      session_id TEXT,
      cve_cache JSON,
      size_bytes INTEGER,
      deprecated INTEGER DEFAULT 0,
      installed_at TEXT DEFAULT (datetime('now'))
    );

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

    CREATE TABLE IF NOT EXISTS api_cache (
      cache_key TEXT PRIMARY KEY,
      response JSON NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hook_executions (
      hook_name TEXT NOT NULL,
      session_id TEXT NOT NULL,
      executed_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (hook_name, session_id)
    );

    CREATE TABLE IF NOT EXISTS plugin_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Code indexer tables (may be missing on DBs that upgraded before indexer was added)
    CREATE TABLE IF NOT EXISTS repo_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      hash TEXT,
      indexed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(repo_id, file_path)
    );

    CREATE TABLE IF NOT EXISTS symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id TEXT NOT NULL,
      file_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      line INTEGER NOT NULL,
      column INTEGER NOT NULL,
      end_line INTEGER,
      exported INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      scope TEXT,
      signature TEXT,
      FOREIGN KEY (file_id) REFERENCES repo_files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      imported_name TEXT NOT NULL,
      local_name TEXT,
      source_path TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      is_namespace INTEGER DEFAULT 0,
      is_type INTEGER DEFAULT 0,
      line INTEGER NOT NULL,
      FOREIGN KEY (file_id) REFERENCES repo_files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS symbol_refs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol_id INTEGER NOT NULL,
      file_id INTEGER NOT NULL,
      line INTEGER NOT NULL,
      column INTEGER NOT NULL,
      FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES repo_files(id) ON DELETE CASCADE
    );
  `);

  // ── Add solution columns that may be missing ───────────────────────

  const solutionColumns: Array<{ name: string; sql: string }> = [
    { name: 'category', sql: "category TEXT CHECK(category IN ('bugfix', 'feature', 'refactor', 'config', 'pattern', 'optimization'))" },
    { name: 'complexity', sql: 'complexity INTEGER CHECK(complexity >= 1 AND complexity <= 10)' },
    { name: 'prerequisites', sql: "prerequisites JSON DEFAULT '[]'" },
    { name: 'anti_patterns', sql: "anti_patterns JSON DEFAULT '[]'" },
    { name: 'code_blocks', sql: "code_blocks JSON DEFAULT '[]'" },
    { name: 'related_solutions', sql: "related_solutions JSON DEFAULT '[]'" },
    { name: 'supersedes', sql: 'supersedes TEXT REFERENCES solutions(id)' },
    { name: 'promoted_to_skill', sql: 'promoted_to_skill TEXT' },
    { name: 'promoted_at', sql: 'promoted_at TEXT' },
  ];

  for (const col of solutionColumns) {
    if (!hasColumn(db, 'solutions', col.name)) {
      db.exec(`ALTER TABLE solutions ADD COLUMN ${col.sql}`);
    }
  }

  // ── Create all indexes ─────────────────────────────────────────────

  db.exec(`
    -- Core
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

    -- Hooks
    CREATE INDEX IF NOT EXISTS idx_warnings_type_target ON warnings(type, target);
    CREATE INDEX IF NOT EXISTS idx_warnings_repo ON warnings(repo_id);
    CREATE INDEX IF NOT EXISTS idx_dep_installs_package ON dependency_installs(package_name);
    CREATE INDEX IF NOT EXISTS idx_dep_installs_session ON dependency_installs(session_id);
    CREATE INDEX IF NOT EXISTS idx_dep_installs_repo ON dependency_installs(repo_id);
    CREATE INDEX IF NOT EXISTS idx_session_summaries_session ON session_summaries(session_id);
    CREATE INDEX IF NOT EXISTS idx_api_cache_created ON api_cache(created_at);
    CREATE INDEX IF NOT EXISTS idx_hook_executions_session ON hook_executions(session_id);

    -- Code indexer
    CREATE INDEX IF NOT EXISTS idx_repo_files_repo ON repo_files(repo_id);
    CREATE INDEX IF NOT EXISTS idx_repo_files_path ON repo_files(repo_id, file_path);
    CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
    CREATE INDEX IF NOT EXISTS idx_symbols_repo ON symbols(repo_id);
    CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
    CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
    CREATE INDEX IF NOT EXISTS idx_symbols_exported ON symbols(exported);
    CREATE INDEX IF NOT EXISTS idx_symbols_name_repo ON symbols(repo_id, name);
    CREATE INDEX IF NOT EXISTS idx_symbols_repo_exported ON symbols(repo_id, exported);
    CREATE INDEX IF NOT EXISTS idx_imports_file ON imports(file_id);
    CREATE INDEX IF NOT EXISTS idx_imports_source ON imports(source_path);
    CREATE INDEX IF NOT EXISTS idx_imports_name ON imports(imported_name);
    CREATE INDEX IF NOT EXISTS idx_symbol_refs_symbol ON symbol_refs(symbol_id);
    CREATE INDEX IF NOT EXISTS idx_symbol_refs_file ON symbol_refs(file_id);
  `);

  // ── Drop removed feature tables ────────────────────────────────────

  db.exec('DROP TABLE IF EXISTS dreamer_executions');
  db.exec('DROP TABLE IF EXISTS dreamer_tasks');
  db.exec('DROP TABLE IF EXISTS background_jobs');
}

export interface MigrationResult {
  fromVersion: number;
  toVersion: number;
  migrationsRun: number;
  success: boolean;
  error?: string;
}

export function runMigrations(): MigrationResult {
  const dbPath = getDbPath();
  const db = new Database(dbPath, { create: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  const currentVersion = getCurrentVersion(db);
  let migrationsRun = 0;

  try {
    if (currentVersion === 0) {
      // Fresh DB — run full schema
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(SCHEMA_SQL);
      db.exec(`INSERT OR REPLACE INTO schema_version (version) VALUES (${SCHEMA_VERSION})`);
      migrationsRun = 1;
    } else if (currentVersion < SCHEMA_VERSION) {
      // Legacy DB — run single idempotent upgrade
      runLegacyUpgrade(db);
      db.exec(`INSERT OR REPLACE INTO schema_version (version) VALUES (${SCHEMA_VERSION})`);
      migrationsRun = 1;
    }
    // else: already at current version, nothing to do

    db.close();
    return {
      fromVersion: currentVersion,
      toVersion: SCHEMA_VERSION,
      migrationsRun,
      success: true,
    };
  } catch (err) {
    db.close();
    return {
      fromVersion: currentVersion,
      toVersion: currentVersion,
      migrationsRun,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getSchemaVersion(): { current: number; latest: number } {
  const dbPath = getDbPath();

  try {
    const db = new Database(dbPath, { create: false, readonly: true });
    const current = getCurrentVersion(db);
    db.close();
    return { current, latest: SCHEMA_VERSION };
  } catch {
    return { current: 0, latest: SCHEMA_VERSION };
  }
}
