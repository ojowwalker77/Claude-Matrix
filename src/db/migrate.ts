import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Schema version - increment when schema changes
const SCHEMA_VERSION = 2;

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
};

function getDbPath(): string {
  return process.env['MATRIX_DB'] || join(__dirname, '../../matrix.db');
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
        // Existing DB, check if it has v2 tables
        const hasWarnings = db.query(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='warnings'
        `).get();

        const initialVersion = hasWarnings ? 2 : 1;
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
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');
      db.exec(schema);
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
