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
import { join } from 'path';
import { homedir } from 'os';
import { Database } from 'bun:sqlite';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { getConfig, saveConfig, clearCache } from '../config/index.js';
import { runMigrations } from '../db/migrate.js';
import { cleanupExpiredSessions } from '../session/index.js';
import { SESSION_MODES } from '../types/session.js';

const CURRENT_VERSION = '1.0.4';
const CLAUDE_DIR = join(homedir(), '.claude');
const FILE_SUGGESTION_DEST = join(CLAUDE_DIR, 'file-suggestion.sh');
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json');

/**
 * Get time-appropriate greeting
 */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Try to get user's name from git config or environment
 */
function getUserName(): string | null {
  try {
    const result = spawnSync('git', ['config', 'user.name'], { encoding: 'utf-8' });
    if (result.status === 0 && result.stdout?.trim()) {
      // Get first name only
      return result.stdout.trim().split(' ')[0] ?? null;
    }
  } catch {
    // Ignore
  }

  // Try environment
  return process.env.USER || process.env.USERNAME || null;
}

/**
 * Generate the session mode selection context for Claude
 * Formatted to trigger AskUserQuestion tool usage
 */
function generateModeSelectionContext(): string {
  const greeting = getGreeting();
  const userName = getUserName();
  const nameStr = userName ? ` ${userName}` : '';

  // Format options for AskUserQuestion tool
  const options = SESSION_MODES.map(m => ({
    label: `${m.emoji} ${m.label}`,
    description: m.description,
  }));

  return `<matrix-session-start>
IMPORTANT: Before responding to the user, you MUST use the AskUserQuestion tool with these exact parameters:

Question: "${greeting}${nameStr}! Which Matrix flow for this session?"
Header: "Session Mode"
Options:
${options.map((o, i) => `  ${i + 1}. label: "${o.label}" | description: "${o.description}"`).join('\n')}

After the user selects, their choice (1-5 or mode name) will be detected automatically.
Do NOT skip this step - always ask on first interaction.
</matrix-session-start>`;
}

// Embedded file-suggestion.sh content
const FILE_SUGGESTION_SCRIPT = `#!/bin/bash
# Custom file suggestion script for Claude Code (installed by Matrix)
# Uses rg + fzf for fuzzy matching and symlink support
# Prerequisites: brew install ripgrep jq fzf

QUERY=$(jq -r '.query // ""')
PROJECT_DIR="\${CLAUDE_PROJECT_DIR:-.}"
cd "$PROJECT_DIR" || exit 1
rg --files --follow --hidden . 2>/dev/null | sort -u | fzf --filter "$QUERY" | head -15
`;

/**
 * Install file-suggestion.sh and update settings.json
 * Returns true if any changes were made
 */
function installFileSuggestion(): boolean {
  let changed = false;

  try {
    // Install the script if not present
    if (!existsSync(FILE_SUGGESTION_DEST)) {
      writeFileSync(FILE_SUGGESTION_DEST, FILE_SUGGESTION_SCRIPT, { mode: 0o755 });
      changed = true;
    }

    // Update settings.json to use it
    let settings: Record<string, unknown> = {};
    if (existsSync(SETTINGS_PATH)) {
      try {
        settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      } catch {
        // Invalid JSON, start fresh
        settings = {};
      }
    }

    // Add fileSuggestion if not configured (respects explicit null/false)
    if (!('fileSuggestion' in settings)) {
      settings.fileSuggestion = {
        type: 'command',
        command: '~/.claude/file-suggestion.sh',
      };
      writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
      changed = true;
    }

    return changed;
  } catch {
    return false;
  }
}

/**
 * Check for missing config sections and save if needed
 * This ensures config file is updated with new sections on upgrade
 */
function ensureConfigComplete(): void {
  try {
    clearCache(); // Get fresh config from disk
    const config = getConfig();

    // Check for v2.0+ required sections
    const missingSections: string[] = [];
    if (!config.hooks?.promptAnalysis?.memoryInjection) missingSections.push('memoryInjection');
    if (!config.hooks?.permissions) missingSections.push('permissions');
    if (!config.hooks?.userRules) missingSections.push('userRules');
    if (!config.hooks?.gitCommitReview) missingSections.push('gitCommitReview');
    if (!config.indexing) missingSections.push('indexing');
    if (!config.toolSearch) missingSections.push('toolSearch');
    if (!config.delegation) missingSections.push('delegation');

    if (missingSections.length > 0) {
      // getConfig() already merged with defaults, just save it
      saveConfig(config);
    }
  } catch {
    // Config issues will be caught by doctor
  }
}
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

// Schema is imported from ../db/schema.ts - single source of truth

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
 * Initialize or migrate the database
 * Uses runMigrations() which handles both fresh DBs and upgrades safely
 */
function initDatabase(): void {
  // runMigrations handles schema versioning properly:
  // - Fresh DB: runs full schema
  // - Existing DB: runs only needed migrations (avoids ALTER TABLE errors)
  runMigrations();

  // Record plugin installation source and version
  const db = new Database(DB_PATH);
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
 * Supports 15 languages: TypeScript/JavaScript, Python, Go, Rust, Java, Kotlin,
 * Swift, C#, Ruby, PHP, C, C++, Elixir, Zig
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
  // Java/Kotlin (Maven/Gradle)
  if (existsSync(join(root, 'pom.xml')) ||
      existsSync(join(root, 'build.gradle')) ||
      existsSync(join(root, 'build.gradle.kts'))) {
    return true;
  }
  // Swift
  if (existsSync(join(root, 'Package.swift'))) {
    return true;
  }
  // C# (.NET)
  if (existsSync(join(root, 'global.json'))) {
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
  // Elixir
  if (existsSync(join(root, 'mix.exs'))) {
    return true;
  }
  // Zig
  if (existsSync(join(root, 'build.zig'))) {
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
      migrateExistingData();

      // Initialize or update database
      // runMigrations() safely handles both fresh and existing databases
      initDatabase();

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

    // Ensure config has all v2.0+ sections (auto-upgrades old configs)
    ensureConfigComplete();

    // Install file-suggestion.sh and update settings.json (silent)
    installFileSuggestion();

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

    // Clean up expired sessions (truly non-blocking via setImmediate)
    setImmediate(() => {
      try {
        cleanupExpiredSessions();
      } catch {
        // Ignore cleanup errors
      }
    });

    // Output session mode selection prompt if enabled
    if (config.sessionModes?.promptOnStart) {
      const modeContext = generateModeSelectionContext();
      // Output to stdout - this gets injected into Claude's context
      console.log(modeContext);
    }

    process.exit(0);
  } catch (err) {
    console.error(`[Matrix] Initialization error: ${err}`);
    process.exit(1); // Non-blocking error
  }
}

if (import.meta.main) run();
