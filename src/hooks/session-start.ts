#!/usr/bin/env bun
/**
 * SessionStart Hook
 *
 * Runs when Claude Code starts a session.
 * Handles first-run initialization:
 *   - Creates ~/.claude/matrix/ directory
 *   - Initializes SQLite database with schema
 *   - Migrates existing data from old installations
 *   - Triggers background model download
 *
 * Exit codes:
 *   0 = Success (continue session)
 *   1 = Non-blocking error (show warning, continue)
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { Database } from 'bun:sqlite';

const CURRENT_VERSION = '0.5.4';
const MATRIX_DIR = join(homedir(), '.claude', 'matrix');
const MARKER_FILE = join(MATRIX_DIR, '.initialized');
const DB_PATH = join(MATRIX_DIR, 'matrix.db');
const MODELS_DIR = join(MATRIX_DIR, 'models');

interface InitState {
  version: string;
  dbInitialized: boolean;
  modelsDownloaded: boolean;
  initializedAt: string;
  lastSessionAt: string;
}

// Embedded schema - same as schema.sql
const SCHEMA = `
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

-- Hooks Integration Tables
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

-- Plugin metadata
CREATE TABLE IF NOT EXISTS plugin_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
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

/**
 * Check for existing database installations and migrate if needed
 */
function migrateExistingData(): boolean {
  const oldPaths = [
    join(MATRIX_DIR, 'Claude-Matrix', 'matrix.db'), // Nested clone bug
    join(homedir(), '.claude', 'matrix', 'Claude-Matrix', 'src', 'db', 'matrix.db'), // Dev location
  ];

  for (const oldPath of oldPaths) {
    if (existsSync(oldPath) && oldPath !== DB_PATH) {
      try {
        console.error(`[Matrix] Migrating database from ${oldPath}...`);
        copyFileSync(oldPath, DB_PATH);
        console.error('[Matrix] Migration complete.');
        return true;
      } catch (err) {
        console.error(`[Matrix] Migration failed: ${err}`);
      }
    }
  }

  return false;
}

/**
 * Initialize the database with schema
 */
function initDatabase(): void {
  const db = new Database(DB_PATH, { create: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);

  // Record plugin installation source
  db.run(`
    INSERT OR REPLACE INTO plugin_meta (key, value, updated_at)
    VALUES ('install_source', 'plugin', datetime('now'))
  `);
  db.run(`
    INSERT OR REPLACE INTO plugin_meta (key, value, updated_at)
    VALUES ('version', ?, datetime('now'))
  `, [CURRENT_VERSION]);

  db.close();
}

/**
 * Print status to user (via stderr, visible in terminal)
 */
function printToUser(message: string): void {
  // Write directly to /dev/tty if available, otherwise stderr
  try {
    const tty = Bun.file('/dev/tty');
    Bun.write(tty, message + '\n');
  } catch {
    console.error(message);
  }
}

export async function run() {
  try {
    // Create directory if it doesn't exist
    if (!existsSync(MATRIX_DIR)) {
      mkdirSync(MATRIX_DIR, { recursive: true });
    }

    // Check marker file
    let state: InitState | null = null;
    if (existsSync(MARKER_FILE)) {
      try {
        state = JSON.parse(readFileSync(MARKER_FILE, 'utf-8'));
      } catch {
        state = null;
      }
    }

    const needsInit = !state || state.version !== CURRENT_VERSION || !existsSync(DB_PATH);

    if (needsInit) {
      printToUser('\x1b[36m[Matrix]\x1b[0m Initializing...');

      // Create models directory
      if (!existsSync(MODELS_DIR)) {
        mkdirSync(MODELS_DIR, { recursive: true });
      }

      // Check for existing data to migrate
      const migrated = migrateExistingData();

      // Initialize or update database
      if (!migrated || !existsSync(DB_PATH)) {
        initDatabase();
      } else {
        // Run schema on migrated DB to add any new tables/indexes
        const db = new Database(DB_PATH);
        db.exec('PRAGMA journal_mode = WAL');
        db.exec('PRAGMA foreign_keys = ON');
        db.exec(SCHEMA);
        db.close();
      }

      // Write marker file
      const newState: InitState = {
        version: CURRENT_VERSION,
        dbInitialized: true,
        modelsDownloaded: false,
        initializedAt: state?.initializedAt || new Date().toISOString(),
        lastSessionAt: new Date().toISOString(),
      };
      writeFileSync(MARKER_FILE, JSON.stringify(newState, null, 2));

      printToUser('\x1b[32m[Matrix]\x1b[0m Ready.');
    } else {
      // Update last session time
      state.lastSessionAt = new Date().toISOString();
      writeFileSync(MARKER_FILE, JSON.stringify(state, null, 2));
    }

    process.exit(0);
  } catch (err) {
    console.error(`[Matrix] Initialization error: ${err}`);
    process.exit(1); // Non-blocking error
  }
}

if (import.meta.main) run();
