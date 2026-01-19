// src/db/schema.test.ts
// Verifies schema.ts and migrations stay in sync
import { test, expect, beforeAll, afterAll, describe } from 'bun:test';
import { Database } from 'bun:sqlite';
import { SCHEMA_SQL } from './schema.js';
import { runMigrations, SCHEMA_VERSION } from './migrate.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface TableRow {
  name: string;
}

interface IndexRow {
  name: string;
}

// Helper: Get table info (columns, types, defaults)
function getTableInfo(db: Database, table: string): ColumnInfo[] {
  return db.query(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

// Helper: Get all tables
function getAllTables(db: Database): string[] {
  return (db.query(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as TableRow[]).map(r => r.name);
}

// Helper: Get all indexes
function getAllIndexes(db: Database): string[] {
  return (db.query(`
    SELECT name FROM sqlite_master
    WHERE type='index' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as IndexRow[]).map(r => r.name);
}

let freshDb: Database;
let migratedDb: Database;
let freshDbPath: string;
let migratedDbPath: string;
let originalMatrixDb: string | undefined;

beforeAll(() => {
  // Save original env
  originalMatrixDb = process.env['MATRIX_DB'];

  // Create fresh DB from SCHEMA_SQL
  freshDbPath = join(tmpdir(), `matrix-fresh-${Date.now()}.db`);
  freshDb = new Database(freshDbPath, { create: true });
  freshDb.exec('PRAGMA journal_mode = WAL');
  freshDb.exec('PRAGMA foreign_keys = ON');
  freshDb.exec(SCHEMA_SQL);
  // Create schema_version table like migrations do
  freshDb.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);
  freshDb.exec(`INSERT INTO schema_version (version) VALUES (${SCHEMA_VERSION})`);

  // Create migrated DB by running all migrations
  migratedDbPath = join(tmpdir(), `matrix-migrated-${Date.now()}.db`);
  process.env['MATRIX_DB'] = migratedDbPath;
  runMigrations();
  migratedDb = new Database(migratedDbPath, { readonly: true });
});

afterAll(() => {
  freshDb.close();
  migratedDb.close();
  if (existsSync(freshDbPath)) unlinkSync(freshDbPath);
  if (existsSync(migratedDbPath)) unlinkSync(migratedDbPath);
  // Restore original env
  if (originalMatrixDb !== undefined) {
    process.env['MATRIX_DB'] = originalMatrixDb;
  } else {
    delete process.env['MATRIX_DB'];
  }
});

// Read migration SQL directly from migrate.ts for testing upgrade paths
// This simulates what happens when upgrading from v4 to v5
function getMigrationV5SQL(): string {
  return `
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
        repo_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dreamer_executions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
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
  `;
}

describe('Schema and Migration Integrity', () => {
  test('fresh and migrated DBs have same tables', () => {
    const freshTables = getAllTables(freshDb);
    const migratedTables = getAllTables(migratedDb);
    expect(freshTables).toEqual(migratedTables);
  });

  test('schema version matches SCHEMA_VERSION constant', () => {
    const freshVersion = freshDb.query('SELECT MAX(version) as version FROM schema_version').get() as { version: number };
    const migratedVersion = migratedDb.query('SELECT MAX(version) as version FROM schema_version').get() as { version: number };
    expect(freshVersion.version).toBe(SCHEMA_VERSION);
    expect(migratedVersion.version).toBe(SCHEMA_VERSION);
  });

  test('all indexes match', () => {
    const freshIdx = getAllIndexes(freshDb);
    const migratedIdx = getAllIndexes(migratedDb);
    expect(freshIdx).toEqual(migratedIdx);
  });

  describe('Table Column Matching', () => {
    // Core tables
    test('repos columns match', () => {
      const freshCols = getTableInfo(freshDb, 'repos');
      const migratedCols = getTableInfo(migratedDb, 'repos');
      expect(freshCols).toEqual(migratedCols);
    });

    test('solutions columns match', () => {
      const freshCols = getTableInfo(freshDb, 'solutions');
      const migratedCols = getTableInfo(migratedDb, 'solutions');
      expect(freshCols).toEqual(migratedCols);
    });

    test('failures columns match', () => {
      const freshCols = getTableInfo(freshDb, 'failures');
      const migratedCols = getTableInfo(migratedDb, 'failures');
      expect(freshCols).toEqual(migratedCols);
    });

    test('usage_log columns match', () => {
      const freshCols = getTableInfo(freshDb, 'usage_log');
      const migratedCols = getTableInfo(migratedDb, 'usage_log');
      expect(freshCols).toEqual(migratedCols);
    });

    // Hooks integration tables
    test('warnings columns match', () => {
      const freshCols = getTableInfo(freshDb, 'warnings');
      const migratedCols = getTableInfo(migratedDb, 'warnings');
      expect(freshCols).toEqual(migratedCols);
    });

    test('dependency_installs columns match', () => {
      const freshCols = getTableInfo(freshDb, 'dependency_installs');
      const migratedCols = getTableInfo(migratedDb, 'dependency_installs');
      expect(freshCols).toEqual(migratedCols);
    });

    test('session_summaries columns match', () => {
      const freshCols = getTableInfo(freshDb, 'session_summaries');
      const migratedCols = getTableInfo(migratedDb, 'session_summaries');
      expect(freshCols).toEqual(migratedCols);
    });

    test('api_cache columns match', () => {
      const freshCols = getTableInfo(freshDb, 'api_cache');
      const migratedCols = getTableInfo(migratedDb, 'api_cache');
      expect(freshCols).toEqual(migratedCols);
    });

    // Dreamer tables
    test('dreamer_tasks columns match', () => {
      const freshCols = getTableInfo(freshDb, 'dreamer_tasks');
      const migratedCols = getTableInfo(migratedDb, 'dreamer_tasks');
      expect(freshCols).toEqual(migratedCols);
    });

    test('dreamer_executions columns match', () => {
      const freshCols = getTableInfo(freshDb, 'dreamer_executions');
      const migratedCols = getTableInfo(migratedDb, 'dreamer_executions');
      expect(freshCols).toEqual(migratedCols);
    });

    test('plugin_meta columns match', () => {
      const freshCols = getTableInfo(freshDb, 'plugin_meta');
      const migratedCols = getTableInfo(migratedDb, 'plugin_meta');
      expect(freshCols).toEqual(migratedCols);
    });
  });

  describe('Default Value Matching', () => {
    test('dreamer_tasks defaults match', () => {
      const fresh = getTableInfo(freshDb, 'dreamer_tasks');
      const migrated = getTableInfo(migratedDb, 'dreamer_tasks');

      for (const col of fresh) {
        const migratedCol = migrated.find(c => c.name === col.name);
        expect(migratedCol).toBeDefined();
        expect(migratedCol?.dflt_value).toBe(col.dflt_value);
      }
    });

    test('solutions defaults match', () => {
      const fresh = getTableInfo(freshDb, 'solutions');
      const migrated = getTableInfo(migratedDb, 'solutions');

      for (const col of fresh) {
        const migratedCol = migrated.find(c => c.name === col.name);
        expect(migratedCol).toBeDefined();
        expect(migratedCol?.dflt_value).toBe(col.dflt_value);
      }
    });

    test('warnings defaults match', () => {
      const fresh = getTableInfo(freshDb, 'warnings');
      const migrated = getTableInfo(migratedDb, 'warnings');

      for (const col of fresh) {
        const migratedCol = migrated.find(c => c.name === col.name);
        expect(migratedCol).toBeDefined();
        expect(migratedCol?.dflt_value).toBe(col.dflt_value);
      }
    });
  });
});

describe('Migration Path Divergence Detection', () => {
  test('v5 migration dreamer_tasks defaults match schema.ts', () => {
    // Create DB using v5 migration SQL (simulates upgrade from v4)
    const upgradedDbPath = join(tmpdir(), `matrix-upgraded-${Date.now()}.db`);
    const upgradedDb = new Database(upgradedDbPath, { create: true });
    upgradedDb.exec(getMigrationV5SQL());

    // Get column info from both
    const freshCols = getTableInfo(freshDb, 'dreamer_tasks');
    const upgradedCols = getTableInfo(upgradedDb, 'dreamer_tasks');

    // Check each column's default value
    const mismatches: string[] = [];
    for (const freshCol of freshCols) {
      const upgradedCol = upgradedCols.find(c => c.name === freshCol.name);
      if (upgradedCol && upgradedCol.dflt_value !== freshCol.dflt_value) {
        mismatches.push(
          `Column '${freshCol.name}': schema.ts='${freshCol.dflt_value}' vs migrate.ts='${upgradedCol.dflt_value}'`
        );
      }
    }

    upgradedDb.close();
    if (existsSync(upgradedDbPath)) unlinkSync(upgradedDbPath);

    expect(mismatches).toEqual([]);
  });
});
