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

    test('plugin_meta columns match', () => {
      const freshCols = getTableInfo(freshDb, 'plugin_meta');
      const migratedCols = getTableInfo(migratedDb, 'plugin_meta');
      expect(freshCols).toEqual(migratedCols);
    });
  });

  describe('Default Value Matching', () => {
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

