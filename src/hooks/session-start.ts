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

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { Database } from 'bun:sqlite';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { getConfig } from '../config/index.js';

const CURRENT_VERSION = '1.0.3';
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

-- ============================================================================
-- Code Indexer Tables (Repository Symbol Index)
-- ============================================================================

-- Track indexed files and their state
CREATE TABLE IF NOT EXISTS repo_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    hash TEXT,
    indexed_at TEXT DEFAULT (datetime('now')),
    UNIQUE(repo_id, file_path)
);

-- Symbol index (functions, classes, variables, types)
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

-- Import statements in files
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

-- References (where symbols are used)
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

/**
 * Find git repository root
 */
function findGitRoot(startPath: string): string | null {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: startPath,
    encoding: 'utf-8',
  });
  if (result.status === 0 && result.stdout) {
    return result.stdout.trim();
  }
  return null;
}

/**
 * Check if directory is an indexable project
 * Supports: TypeScript/JavaScript, Python, Go, Rust, Java, C/C++, Ruby, PHP
 */
function isIndexableProject(root: string): boolean {
  // TypeScript/JavaScript
  if (existsSync(join(root, 'package.json')) ||
      existsSync(join(root, 'tsconfig.json')) ||
      existsSync(join(root, 'jsconfig.json'))) {
    return true;
  }
  // Python
  if (existsSync(join(root, 'pyproject.toml')) ||
      existsSync(join(root, 'setup.py')) ||
      existsSync(join(root, 'requirements.txt'))) {
    return true;
  }
  // Go
  if (existsSync(join(root, 'go.mod'))) {
    return true;
  }
  // Rust
  if (existsSync(join(root, 'Cargo.toml'))) {
    return true;
  }
  // Java/Maven/Gradle
  if (existsSync(join(root, 'pom.xml')) ||
      existsSync(join(root, 'build.gradle')) ||
      existsSync(join(root, 'build.gradle.kts'))) {
    return true;
  }
  // Ruby
  if (existsSync(join(root, 'Gemfile'))) {
    return true;
  }
  // PHP
  if (existsSync(join(root, 'composer.json'))) {
    return true;
  }
  // C/C++ (CMake or Makefile + source files to avoid false positives)
  if (existsSync(join(root, 'CMakeLists.txt')) ||
      existsSync(join(root, 'Makefile'))) {
    // Verify actual C/C++ source files exist to avoid matching non-C/C++ projects
    try {
      const files = readdirSync(root);
      const hasCppSources = files.some(f =>
        /\.(c|cpp|cc|cxx|h|hpp|hxx)$/i.test(f)
      );
      if (hasCppSources) return true;
      // Also check common src directory
      const srcDir = join(root, 'src');
      if (existsSync(srcDir)) {
        const srcFiles = readdirSync(srcDir);
        if (srcFiles.some(f => /\.(c|cpp|cc|cxx|h|hpp|hxx)$/i.test(f))) {
          return true;
        }
      }
    } catch {
      // If we can't read directories, skip C/C++ detection
    }
  }
  return false;
}

/**
 * Generate a stable repo ID from path
 */
function generateRepoId(root: string): string {
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 8);
  return `repo_${hash}`;
}

interface IndexingConfig {
  excludePatterns: string[];
  maxFileSize: number;
  timeout: number;
  includeTests: boolean;
}

/**
 * Run the repository indexer
 */
async function runIndexer(repoRoot: string, repoId: string, config: IndexingConfig): Promise<void> {
  try {
    // Dynamic import to avoid loading heavy modules if not needed
    const { indexRepository } = await import('../indexer/index.js');

    let lastProgress = '';
    const result = await indexRepository({
      repoRoot,
      repoId,
      incremental: true,
      timeout: config.timeout,
      excludePatterns: config.excludePatterns,
      maxFileSize: config.maxFileSize,
      includeTests: config.includeTests,
      onProgress: (msg, pct) => {
        // Update progress on same line
        const progressLine = `\r\x1b[36m[Matrix]\x1b[0m ${msg} (${pct}%)`;
        if (progressLine !== lastProgress) {
          printToUser(progressLine);
          lastProgress = progressLine;
        }
      },
    });

    // Clear progress line and show result
    if (result.filesIndexed > 0) {
      printToUser(`\r\x1b[32m[Matrix]\x1b[0m Indexed ${result.filesIndexed} files, ${result.symbolsFound} symbols (${result.duration}ms)`);
    } else if (result.filesSkipped > 0) {
      printToUser(`\r\x1b[32m[Matrix]\x1b[0m Index up to date (${result.filesSkipped} files)`);
    }
  } catch (err) {
    // Silently fail - indexing is optional
    console.error(`[Matrix] Indexer error: ${err}`);
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
      const isUpgrade = state && state.version !== CURRENT_VERSION;
      const isFirstRun = !state;

      if (isUpgrade && state) {
        printToUser(`\x1b[36m[Matrix]\x1b[0m Upgrading ${state.version} → ${CURRENT_VERSION}...`);
      } else if (isFirstRun) {
        printToUser('\x1b[36m[Matrix]\x1b[0m Initializing...');
      } else {
        printToUser('\x1b[36m[Matrix]\x1b[0m Repairing...');
      }

      // Create models directory
      if (!existsSync(MODELS_DIR)) {
        mkdirSync(MODELS_DIR, { recursive: true });
      }

      // Check for existing data to migrate from old locations
      const migrated = migrateExistingData();

      // Initialize or update database
      if (!existsSync(DB_PATH)) {
        // Fresh install - create new database
        initDatabase();
      } else {
        // Existing database - run schema migrations
        // This ensures new tables/columns are added on upgrade
        const db = new Database(DB_PATH);
        db.exec('PRAGMA journal_mode = WAL');
        db.exec('PRAGMA foreign_keys = ON');
        db.exec(SCHEMA);
        // Update version in database
        db.run(`
          INSERT OR REPLACE INTO plugin_meta (key, value, updated_at)
          VALUES ('version', ?, datetime('now'))
        `, [CURRENT_VERSION]);
        db.close();
      }

      // Write marker file
      const newState: InitState = {
        version: CURRENT_VERSION,
        dbInitialized: true,
        modelsDownloaded: state?.modelsDownloaded || false,
        initializedAt: state?.initializedAt || new Date().toISOString(),
        lastSessionAt: new Date().toISOString(),
      };
      writeFileSync(MARKER_FILE, JSON.stringify(newState, null, 2));

      printToUser('\x1b[32m[Matrix]\x1b[0m Ready.');
    } else if (state) {
      // Update last session time
      state.lastSessionAt = new Date().toISOString();
      writeFileSync(MARKER_FILE, JSON.stringify(state, null, 2));
    }

    // Run indexer for supported projects (if enabled)
    const config = getConfig();
    if (config.indexing.enabled) {
      const cwd = process.cwd();
      const repoRoot = findGitRoot(cwd) || cwd;
      if (isIndexableProject(repoRoot)) {
        const repoId = generateRepoId(repoRoot);
        await runIndexer(repoRoot, repoId, config.indexing);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error(`[Matrix] Initialization error: ${err}`);
    process.exit(1); // Non-blocking error
  }
}

if (import.meta.main) run();
