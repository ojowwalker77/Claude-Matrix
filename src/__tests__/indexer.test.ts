import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTestDb, closeTestDb, getTestDb } from './helpers.js';
import { parseFile, extractSymbols, extractImports } from '../indexer/parser.js';
import { computeDiff, hasChanges, getDiffSummary } from '../indexer/diff.js';
import { isExcluded } from '../indexer/scanner.js';
import type { ScannedFile, RepoFileRow } from '../indexer/types.js';

// ============================================
// Parser Tests
// ============================================

describe('parseFile', () => {
  test('extracts function declarations', async () => {
    const code = `
      export function handleRequest(req: Request): Response {
        return new Response('ok');
      }

      function privateHelper() {
        return 42;
      }
    `;

    const result = await parseFile('test.ts', code);

    expect(result.symbols.length).toBe(2);

    const exported = result.symbols.find(s => s.name === 'handleRequest');
    expect(exported).toBeDefined();
    expect(exported?.kind).toBe('function');
    expect(exported?.exported).toBe(true);
    expect(exported?.signature).toContain('req: Request');

    const priv = result.symbols.find(s => s.name === 'privateHelper');
    expect(priv).toBeDefined();
    expect(priv?.exported).toBe(false);
  });

  test('extracts class declarations', async () => {
    const code = `
      export class UserService {
        private db: Database;

        async getUser(id: string): Promise<User> {
          return this.db.find(id);
        }
      }
    `;

    const result = await parseFile('test.ts', code);

    const cls = result.symbols.find(s => s.name === 'UserService');
    expect(cls).toBeDefined();
    expect(cls?.kind).toBe('class');
    expect(cls?.exported).toBe(true);

    const method = result.symbols.find(s => s.name === 'getUser');
    expect(method).toBeDefined();
    expect(method?.kind).toBe('method');
    expect(method?.scope).toBe('UserService');
  });

  test('extracts interface declarations', async () => {
    const code = `
      export interface User {
        id: string;
        name: string;
      }

      interface InternalConfig {
        debug: boolean;
      }
    `;

    const result = await parseFile('test.ts', code);

    expect(result.symbols.length).toBe(2);

    const user = result.symbols.find(s => s.name === 'User');
    expect(user?.kind).toBe('interface');
    expect(user?.exported).toBe(true);

    const internal = result.symbols.find(s => s.name === 'InternalConfig');
    expect(internal?.exported).toBe(false);
  });

  test('extracts type aliases', async () => {
    const code = `
      export type UserId = string;
      type Config = { debug: boolean };
    `;

    const result = await parseFile('test.ts', code);

    const userId = result.symbols.find(s => s.name === 'UserId');
    expect(userId?.kind).toBe('type');
    expect(userId?.exported).toBe(true);
  });

  test('extracts arrow functions', async () => {
    const code = `
      export const add = (a: number, b: number): number => a + b;
      const multiply = (x: number, y: number) => x * y;
    `;

    const result = await parseFile('test.ts', code);

    const add = result.symbols.find(s => s.name === 'add');
    expect(add?.kind).toBe('function');
    expect(add?.exported).toBe(true);
    expect(add?.signature).toContain('a: number');
  });

  test('extracts enum declarations', async () => {
    const code = `
      export enum Status {
        Active,
        Inactive,
        Pending
      }
    `;

    const result = await parseFile('test.ts', code);

    const status = result.symbols.find(s => s.name === 'Status');
    expect(status?.kind).toBe('enum');
    expect(status?.exported).toBe(true);
  });

  test('extracts imports', async () => {
    const code = `
      import { readFile, writeFile } from 'fs';
      import path from 'path';
      import * as crypto from 'crypto';
      import type { Request, Response } from 'express';
    `;

    const result = await parseFile('test.ts', code);

    // readFile, writeFile, path, crypto, Request, Response = 6 imports
    expect(result.imports.length).toBe(6);

    const readFileImport = result.imports.find(i => i.importedName === 'readFile');
    expect(readFileImport?.sourcePath).toBe('fs');
    expect(readFileImport?.isDefault).toBe(false);

    const pathImport = result.imports.find(i => i.importedName === 'path');
    expect(pathImport?.isDefault).toBe(true);

    const cryptoImport = result.imports.find(i => i.importedName === 'crypto');
    expect(cryptoImport?.isNamespace).toBe(true);

    const requestImport = result.imports.find(i => i.importedName === 'Request');
    expect(requestImport?.isType).toBe(true);
  });

  test('handles JSX files', async () => {
    const code = `
      import React from 'react';

      export function Button({ label }: { label: string }) {
        return <button>{label}</button>;
      }
    `;

    const result = await parseFile('Button.tsx', code);

    const button = result.symbols.find(s => s.name === 'Button');
    expect(button).toBeDefined();
    expect(button?.kind).toBe('function');
  });

  test('handles empty files', async () => {
    const result = await parseFile('empty.ts', '');
    expect(result.symbols.length).toBe(0);
    expect(result.imports.length).toBe(0);
    expect(result.errors).toBeUndefined();
  });
});

// ============================================
// Diff Tests
// ============================================

describe('computeDiff', () => {
  test('detects added files', () => {
    const scanned: ScannedFile[] = [
      { path: 'src/new.ts', absolutePath: '/project/src/new.ts', mtime: 1000 },
    ];
    const indexed = new Map<string, RepoFileRow>();

    const diff = computeDiff(scanned, indexed);

    expect(diff.added.length).toBe(1);
    expect(diff.added[0]?.path).toBe('src/new.ts');
    expect(diff.modified.length).toBe(0);
    expect(diff.deleted.length).toBe(0);
  });

  test('detects modified files', () => {
    const scanned: ScannedFile[] = [
      { path: 'src/file.ts', absolutePath: '/project/src/file.ts', mtime: 2000 },
    ];
    const indexed = new Map<string, RepoFileRow>([
      ['src/file.ts', { id: 1, repo_id: 'repo_1', file_path: 'src/file.ts', mtime: 1000, hash: null, indexed_at: '' }],
    ]);

    const diff = computeDiff(scanned, indexed);

    expect(diff.added.length).toBe(0);
    expect(diff.modified.length).toBe(1);
    expect(diff.modified[0]?.path).toBe('src/file.ts');
    expect(diff.deleted.length).toBe(0);
  });

  test('detects deleted files', () => {
    const scanned: ScannedFile[] = [];
    const indexed = new Map<string, RepoFileRow>([
      ['src/old.ts', { id: 1, repo_id: 'repo_1', file_path: 'src/old.ts', mtime: 1000, hash: null, indexed_at: '' }],
    ]);

    const diff = computeDiff(scanned, indexed);

    expect(diff.added.length).toBe(0);
    expect(diff.modified.length).toBe(0);
    expect(diff.deleted.length).toBe(1);
    expect(diff.deleted[0]).toBe('src/old.ts');
  });

  test('detects unchanged files', () => {
    const scanned: ScannedFile[] = [
      { path: 'src/file.ts', absolutePath: '/project/src/file.ts', mtime: 1000 },
    ];
    const indexed = new Map<string, RepoFileRow>([
      ['src/file.ts', { id: 1, repo_id: 'repo_1', file_path: 'src/file.ts', mtime: 1000, hash: null, indexed_at: '' }],
    ]);

    const diff = computeDiff(scanned, indexed);

    expect(diff.added.length).toBe(0);
    expect(diff.modified.length).toBe(0);
    expect(diff.deleted.length).toBe(0);
  });

  test('handles complex scenario', () => {
    const scanned: ScannedFile[] = [
      { path: 'src/new.ts', absolutePath: '/project/src/new.ts', mtime: 1000 },
      { path: 'src/modified.ts', absolutePath: '/project/src/modified.ts', mtime: 2000 },
      { path: 'src/unchanged.ts', absolutePath: '/project/src/unchanged.ts', mtime: 1000 },
    ];
    const indexed = new Map<string, RepoFileRow>([
      ['src/modified.ts', { id: 1, repo_id: 'repo_1', file_path: 'src/modified.ts', mtime: 1000, hash: null, indexed_at: '' }],
      ['src/unchanged.ts', { id: 2, repo_id: 'repo_1', file_path: 'src/unchanged.ts', mtime: 1000, hash: null, indexed_at: '' }],
      ['src/deleted.ts', { id: 3, repo_id: 'repo_1', file_path: 'src/deleted.ts', mtime: 1000, hash: null, indexed_at: '' }],
    ]);

    const diff = computeDiff(scanned, indexed);

    expect(diff.added.length).toBe(1);
    expect(diff.modified.length).toBe(1);
    expect(diff.deleted.length).toBe(1);
  });
});

describe('hasChanges', () => {
  test('returns false for empty diff', () => {
    expect(hasChanges({ added: [], modified: [], deleted: [] })).toBe(false);
  });

  test('returns true for added files', () => {
    expect(hasChanges({
      added: [{ path: 'a.ts', absolutePath: '/a.ts', mtime: 1 }],
      modified: [],
      deleted: []
    })).toBe(true);
  });
});

describe('getDiffSummary', () => {
  test('returns "No changes" for empty diff', () => {
    expect(getDiffSummary({ added: [], modified: [], deleted: [] })).toBe('No changes');
  });

  test('summarizes changes', () => {
    const summary = getDiffSummary({
      added: [{ path: 'a.ts', absolutePath: '/a.ts', mtime: 1 }],
      modified: [{ path: 'b.ts', absolutePath: '/b.ts', mtime: 1 }],
      deleted: ['c.ts'],
    });
    expect(summary).toBe('1 new, 1 modified, 1 deleted');
  });
});

// ============================================
// Scanner Tests
// ============================================

describe('isExcluded', () => {
  test('excludes node_modules', () => {
    expect(isExcluded('node_modules/lodash/index.js')).toBe(true);
    expect(isExcluded('src/node_modules/test.js')).toBe(true);
  });

  test('excludes dist', () => {
    expect(isExcluded('dist/index.js')).toBe(true);
    expect(isExcluded('src/dist/bundle.js')).toBe(true);
  });

  test('excludes .git', () => {
    expect(isExcluded('.git/hooks/pre-commit')).toBe(true);
  });

  test('excludes declaration files', () => {
    expect(isExcluded('src/types.d.ts')).toBe(true);
    expect(isExcluded('lib/index.d.mts')).toBe(true);
  });

  test('excludes test files by default', () => {
    expect(isExcluded('src/utils.test.ts')).toBe(true);
    expect(isExcluded('src/utils.spec.ts')).toBe(true);
  });

  test('excludes minified files', () => {
    expect(isExcluded('public/app.min.js')).toBe(true);
    expect(isExcluded('dist/bundle.bundle.js')).toBe(true);
  });

  test('allows regular source files', () => {
    expect(isExcluded('src/index.ts')).toBe(false);
    expect(isExcluded('src/utils/helpers.ts')).toBe(false);
    expect(isExcluded('lib/api.js')).toBe(false);
  });

  test('allows custom exclusions', () => {
    expect(isExcluded('src/generated/types.ts', ['**/generated/**'])).toBe(true);
    expect(isExcluded('src/manual/types.ts', ['**/generated/**'])).toBe(false);
  });
});

// ============================================
// Integration: extractSymbols / extractImports
// ============================================

describe('extractSymbols', () => {
  test('returns only symbols', async () => {
    const code = `
      import { foo } from './foo';
      export function bar() {}
    `;

    const symbols = await extractSymbols('test.ts', code);

    expect(symbols.length).toBe(1);
    expect(symbols[0]?.name).toBe('bar');
  });
});

describe('extractImports', () => {
  test('returns only imports', async () => {
    const code = `
      import { foo } from './foo';
      export function bar() {}
    `;

    const imports = await extractImports('test.ts', code);

    expect(imports.length).toBe(1);
    expect(imports[0]?.importedName).toBe('foo');
  });
});
