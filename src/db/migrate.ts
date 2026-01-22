import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { SCHEMA_SQL } from './schema.js';

// Schema version - increment when schema changes
export const SCHEMA_VERSION = 7;

// Migration definitions - each migration upgrades from (version - 1) to version
const migrations: Record<number, string> = {
  // v1 -> v2: Added hooks integration tables
  2: `
    -- Warnings for files and packages
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

    CREATE INDEX IF NOT EXISTS idx_warnings_type_target ON warnings(type, target);
    CREATE INDEX IF NOT EXISTS idx_warnings_repo ON warnings(repo_id);
    CREATE INDEX IF NOT EXISTS idx_dep_installs_package ON dependency_installs(package_name);
    CREATE INDEX IF NOT EXISTS idx_dep_installs_session ON dependency_installs(session_id);
    CREATE INDEX IF NOT EXISTS idx_dep_installs_repo ON dependency_installs(repo_id);
    CREATE INDEX IF NOT EXISTS idx_session_summaries_session ON session_summaries(session_id);
    CREATE INDEX IF NOT EXISTS idx_api_cache_created ON api_cache(created_at);
  `,

  // v2 -> v3: Enhanced memory with structured metadata
  3: `
    ALTER TABLE solutions ADD COLUMN category TEXT CHECK(category IN ('bugfix', 'feature', 'refactor', 'config', 'pattern', 'optimization'));
    ALTER TABLE solutions ADD COLUMN complexity INTEGER CHECK(complexity >= 1 AND complexity <= 10);
    ALTER TABLE solutions ADD COLUMN prerequisites JSON DEFAULT '[]';
    ALTER TABLE solutions ADD COLUMN anti_patterns JSON DEFAULT '[]';
    ALTER TABLE solutions ADD COLUMN code_blocks JSON DEFAULT '[]';
    ALTER TABLE solutions ADD COLUMN related_solutions JSON DEFAULT '[]';
    ALTER TABLE solutions ADD COLUMN supersedes TEXT REFERENCES solutions(id);
    CREATE INDEX IF NOT EXISTS idx_solutions_category ON solutions(category);
    CREATE INDEX IF NOT EXISTS idx_solutions_complexity ON solutions(complexity);
    CREATE INDEX IF NOT EXISTS idx_solutions_supersedes ON solutions(supersedes);
  `,

  // v3 -> v4: Skill Factory columns
  4: `
    ALTER TABLE solutions ADD COLUMN promoted_to_skill TEXT;
    ALTER TABLE solutions ADD COLUMN promoted_at TEXT;
    CREATE INDEX IF NOT EXISTS idx_solutions_promoted ON solutions(promoted_to_skill);
  `,

  // v4 -> v5: Dreamer (Scheduled Task Automation)
  5: `
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
        worktree_branch_prefix TEXT DEFAULT 'matrix-dreamer/',
        worktree_remote TEXT DEFAULT 'origin',
        tags JSON DEFAULT '[]',
        repo_id TEXT REFERENCES repos(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );

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

    CREATE INDEX IF NOT EXISTS idx_dreamer_tasks_repo ON dreamer_tasks(repo_id);
    CREATE INDEX IF NOT EXISTS idx_dreamer_tasks_enabled ON dreamer_tasks(enabled);
    CREATE INDEX IF NOT EXISTS idx_dreamer_executions_task ON dreamer_executions(task_id);
    CREATE INDEX IF NOT EXISTS idx_dreamer_executions_started ON dreamer_executions(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dreamer_executions_status ON dreamer_executions(status);
  `,

  // v5 -> v6: Plugin metadata table
  6: `
    CREATE TABLE IF NOT EXISTS plugin_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
    );
  `,

  // v6 -> v7: Missing tables that were in schema but not migrations
  // This fixes databases that upgraded from older versions
  7: `
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
        pid INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_hook_executions_session ON hook_executions(session_id);
    CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_background_jobs_tool ON background_jobs(tool_name);
  `,
};

function getDbPath(): string {
  return process.env['MATRIX_DB'] || join(homedir(), '.claude', 'matrix', 'matrix.db');
}

function getCurrentVersion(db: Database): number {
  try {
    // Check if schema_version table exists
    const tableExists = db.query(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='schema_version'
    `).get();

    if (!tableExists) {
      // Create schema_version table
      db.exec(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // Check if this is a fresh DB or existing one without versioning
      const hasSolutions = db.query(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='solutions'
      `).get();

      if (hasSolutions) {
        // Existing DB, check if it has ALL v2 tables
        const v2Tables = ['warnings', 'dependency_installs', 'session_summaries', 'api_cache'];
        const existingTables = db.query(`
          SELECT name FROM sqlite_master WHERE type='table' AND name IN ('warnings', 'dependency_installs', 'session_summaries', 'api_cache')
        `).all() as { name: string }[];

        let hasAllV2Tables = v2Tables.every(t => existingTables.some(e => e.name === t));

        // Validate table integrity - verify tables are actually accessible
        if (hasAllV2Tables) {
          try {
            // Quick query to verify v2 tables are not corrupted
            db.query('SELECT 1 FROM warnings LIMIT 1').get();
          } catch {
            // Tables exist but may be corrupted, treat as v1
            hasAllV2Tables = false;
          }
        }

        // Check for v3, v4, and v5 features
        let hasV3Columns = false;
        let hasV4Columns = false;
        let hasV5Tables = false;
        if (hasAllV2Tables) {
          try {
            const cols = db.query(`PRAGMA table_info(solutions)`).all() as { name: string }[];
            hasV3Columns = cols.some(c => c.name === 'category');
            hasV4Columns = cols.some(c => c.name === 'promoted_to_skill');
          } catch {
            hasV3Columns = false;
            hasV4Columns = false;
          }

          // Check for v5 (Dreamer tables)
          if (hasV4Columns) {
            try {
              const dreamerTable = db.query(`
                SELECT name FROM sqlite_master WHERE type='table' AND name='dreamer_tasks'
              `).get();
              hasV5Tables = !!dreamerTable;
            } catch {
              hasV5Tables = false;
            }
          }
        }

        // Check for v6 (plugin_meta table)
        let hasV6Tables = false;
        if (hasV5Tables) {
          try {
            const pluginMetaTable = db.query(`
              SELECT name FROM sqlite_master WHERE type='table' AND name='plugin_meta'
            `).get();
            hasV6Tables = !!pluginMetaTable;
          } catch {
            hasV6Tables = false;
          }
        }

        // Check for v7 (background_jobs and hook_executions tables)
        let hasV7Tables = false;
        if (hasV6Tables) {
          try {
            const bgJobsTable = db.query(`
              SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
            `).get();
            const hookExecTable = db.query(`
              SELECT name FROM sqlite_master WHERE type='table' AND name='hook_executions'
            `).get();
            hasV7Tables = !!(bgJobsTable && hookExecTable);
          } catch {
            hasV7Tables = false;
          }
        }

        const initialVersion = hasV7Tables ? 7 : (hasV6Tables ? 6 : (hasV5Tables ? 5 : (hasV4Columns ? 4 : (hasV3Columns ? 3 : (hasAllV2Tables ? 2 : 1)))));
        db.exec(`INSERT INTO schema_version (version) VALUES (${initialVersion})`);
        return initialVersion;
      } else {
        // Fresh DB, will run full schema
        return 0;
      }
    }

    const row = db.query('SELECT MAX(version) as version FROM schema_version').get() as { version: number } | null;
    return row?.version || 0;
  } catch {
    return 0;
  }
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
    // If fresh DB (version 0), run full schema
    if (currentVersion === 0) {
      db.exec(SCHEMA_SQL);
      db.exec(`INSERT OR REPLACE INTO schema_version (version) VALUES (${SCHEMA_VERSION})`);
      db.close();
      return {
        fromVersion: 0,
        toVersion: SCHEMA_VERSION,
        migrationsRun: 1,
        success: true,
      };
    }

    // Run incremental migrations
    for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
      const migration = migrations[v];
      if (migration) {
        db.exec(migration);
        db.exec(`INSERT INTO schema_version (version) VALUES (${v})`);
        migrationsRun++;
      }
    }

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
