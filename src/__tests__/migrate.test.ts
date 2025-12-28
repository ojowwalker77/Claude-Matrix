import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// V2 schema - solutions table WITHOUT category, complexity, etc.
const V2_SCHEMA = `
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

CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solution_id TEXT REFERENCES solutions(id),
    repo_id TEXT REFERENCES repos(id),
    outcome TEXT CHECK(outcome IN ('success', 'partial', 'failure', 'skipped')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

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

CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO schema_version (version) VALUES (2);
`;

// Migration 3 - adds category, complexity, etc.
const MIGRATION_3 = `
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
`;

let testDir: string;
let dbPath: string;

describe('database migrations', () => {
  beforeEach(() => {
    // Create temp directory for test database
    testDir = join(tmpdir(), `matrix-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'matrix.db');
  });

  afterEach(() => {
    // Clean up
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('v2 database without category column fails on index creation', () => {
    // Create v2 database
    const db = new Database(dbPath, { create: true });
    db.exec(V2_SCHEMA);

    // Verify solutions table exists but has no category column
    const cols = db.query('PRAGMA table_info(solutions)').all() as { name: string }[];
    const hasCategory = cols.some(c => c.name === 'category');
    expect(hasCategory).toBe(false);

    // Attempting to create index on non-existent column should fail
    expect(() => {
      db.exec('CREATE INDEX IF NOT EXISTS idx_solutions_category ON solutions(category)');
    }).toThrow(/no such column/);

    db.close();
  });

  test('migration 3 adds category column and creates index successfully', () => {
    // Create v2 database
    const db = new Database(dbPath, { create: true });
    db.exec(V2_SCHEMA);

    // Verify no category column
    let cols = db.query('PRAGMA table_info(solutions)').all() as { name: string }[];
    expect(cols.some(c => c.name === 'category')).toBe(false);

    // Run migration 3
    db.exec(MIGRATION_3);

    // Verify category column now exists
    cols = db.query('PRAGMA table_info(solutions)').all() as { name: string }[];
    expect(cols.some(c => c.name === 'category')).toBe(true);
    expect(cols.some(c => c.name === 'complexity')).toBe(true);
    expect(cols.some(c => c.name === 'supersedes')).toBe(true);

    // Verify index exists
    const indexes = db.query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_solutions_category'").all();
    expect(indexes.length).toBe(1);

    db.close();
  });

  test('can insert and query category after migration', () => {
    // Create v2 database and run migration
    const db = new Database(dbPath, { create: true });
    db.exec(V2_SCHEMA);
    db.exec(MIGRATION_3);

    // Insert solution with category
    const embBuffer = Buffer.from(new Float32Array(384).buffer);
    db.query(`
      INSERT INTO solutions (id, problem, problem_embedding, solution, scope, category, complexity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('sol_001', 'Test problem', embBuffer, 'Test solution', 'global', 'bugfix', 5);

    // Query including category column (this would fail before migration)
    const result = db.query(`
      SELECT id, problem, solution, scope, category, complexity
      FROM solutions WHERE id = ?
    `).get('sol_001') as { id: string; category: string; complexity: number };

    expect(result.id).toBe('sol_001');
    expect(result.category).toBe('bugfix');
    expect(result.complexity).toBe(5);

    db.close();
  });

  test('existing solutions retain data after migration', () => {
    // Create v2 database
    const db = new Database(dbPath, { create: true });
    db.exec(V2_SCHEMA);

    // Insert solution without category (v2 style)
    const embBuffer = Buffer.from(new Float32Array(384).buffer);
    db.query(`
      INSERT INTO solutions (id, problem, problem_embedding, solution, scope, score)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('sol_existing', 'Existing problem', embBuffer, 'Existing solution', 'global', 0.8);

    // Run migration
    db.exec(MIGRATION_3);

    // Verify existing solution still exists with null category
    const result = db.query(`
      SELECT id, problem, solution, category, complexity
      FROM solutions WHERE id = ?
    `).get('sol_existing') as { id: string; problem: string; category: string | null; complexity: number | null };

    expect(result.id).toBe('sol_existing');
    expect(result.problem).toBe('Existing problem');
    expect(result.category).toBeNull();
    expect(result.complexity).toBeNull();

    db.close();
  });

  test('category constraint is enforced after migration', () => {
    // Create v2 database and run migration
    const db = new Database(dbPath, { create: true });
    db.exec(V2_SCHEMA);
    db.exec(MIGRATION_3);

    const embBuffer = Buffer.from(new Float32Array(384).buffer);

    // Invalid category should fail
    expect(() => {
      db.query(`
        INSERT INTO solutions (id, problem, problem_embedding, solution, scope, category)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('sol_bad', 'Test', embBuffer, 'Test', 'global', 'invalid_category');
    }).toThrow();

    db.close();
  });
});
