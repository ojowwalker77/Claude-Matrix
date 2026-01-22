import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getGitContextData } from '../hooks/prompt-utils.js';

describe('getGitContextData', () => {
  let testDir: string;
  let gitDir: string;

  beforeEach(() => {
    // Create unique test directory
    testDir = join(tmpdir(), `matrix-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('returns null branch for non-git directory', async () => {
    const result = await getGitContextData(testDir);

    expect(result.branch).toBeNull();
    expect(result.commits).toEqual([]);
    expect(result.changedFiles).toEqual([]);
  });

  test('returns branch/commits/changedFiles for git repo', async () => {
    // Initialize git repo
    gitDir = testDir;
    const gitInit = Bun.spawnSync(['git', 'init'], { cwd: gitDir });
    expect(gitInit.exitCode).toBe(0);

    // Configure git for test
    Bun.spawnSync(['git', 'config', 'user.email', 'test@test.com'], { cwd: gitDir });
    Bun.spawnSync(['git', 'config', 'user.name', 'Test User'], { cwd: gitDir });

    // Create and commit a file
    writeFileSync(join(gitDir, 'test.txt'), 'test content');
    Bun.spawnSync(['git', 'add', 'test.txt'], { cwd: gitDir });
    Bun.spawnSync(['git', 'commit', '-m', 'Initial commit'], { cwd: gitDir });

    // Create a modified file
    writeFileSync(join(gitDir, 'modified.txt'), 'modified content');

    const result = await getGitContextData(gitDir);

    // Should have branch (master or main depending on git version)
    expect(result.branch).not.toBeNull();
    expect(['main', 'master']).toContain(result.branch);

    // Should have at least one commit
    expect(result.commits.length).toBeGreaterThan(0);
    expect(result.commits[0]).toContain('Initial commit');

    // Should show untracked file
    expect(result.changedFiles.length).toBeGreaterThan(0);
  });

  test('handles git command failures gracefully', async () => {
    // Use a directory that exists but isn't a git repo
    // Calling git commands should fail but not throw

    const result = await getGitContextData(testDir);

    // Should return empty/null values, not throw
    expect(result).toBeDefined();
    expect(result.branch).toBeNull();
    expect(result.commits).toEqual([]);
    expect(result.changedFiles).toEqual([]);
  });

  test('handles non-existent directory gracefully', async () => {
    const nonExistentDir = join(testDir, 'does-not-exist');

    const result = await getGitContextData(nonExistentDir);

    // Should return empty values, not throw
    expect(result).toBeDefined();
    expect(result.branch).toBeNull();
  });

  test('returns empty strings/arrays for empty repo (no commits)', async () => {
    gitDir = testDir;
    Bun.spawnSync(['git', 'init'], { cwd: gitDir });

    const result = await getGitContextData(gitDir);

    // Branch might be null or empty in a fresh repo with no commits
    // Commits should be empty
    expect(result.commits).toEqual([]);
  });

  test('limits changed files to 10', async () => {
    gitDir = testDir;
    Bun.spawnSync(['git', 'init'], { cwd: gitDir });
    Bun.spawnSync(['git', 'config', 'user.email', 'test@test.com'], { cwd: gitDir });
    Bun.spawnSync(['git', 'config', 'user.name', 'Test User'], { cwd: gitDir });

    // Create initial commit
    writeFileSync(join(gitDir, 'init.txt'), 'init');
    Bun.spawnSync(['git', 'add', '.'], { cwd: gitDir });
    Bun.spawnSync(['git', 'commit', '-m', 'init'], { cwd: gitDir });

    // Create 15 untracked files
    for (let i = 0; i < 15; i++) {
      writeFileSync(join(gitDir, `file${i}.txt`), `content ${i}`);
    }

    const result = await getGitContextData(gitDir);

    // Should be limited to 10 files
    expect(result.changedFiles.length).toBeLessThanOrEqual(10);
  });
});
