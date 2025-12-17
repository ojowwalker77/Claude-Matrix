import { describe, test, expect } from 'bun:test';
import { fingerprintRepo, fingerprintToText, type DetectedRepo } from '../repo/fingerprint.js';

describe('fingerprintRepo', () => {
  test('detects current repo (matrix)', () => {
    const fp = fingerprintRepo();

    expect(fp.root).toBeDefined();
    expect(fp.name.toLowerCase()).toBe('claude-matrix');
    expect(fp.languages).toContain('typescript');
    expect(fp.dependencies).toContain('@modelcontextprotocol/sdk');
  });

  test('returns name from folder if no git remote', () => {
    const fp = fingerprintRepo('/tmp');
    expect(fp.name).toBe('tmp');
  });

  test('merges multiple project types', () => {
    // Matrix only has package.json, so languages should be typescript
    const fp = fingerprintRepo();
    expect(fp.languages.length).toBeGreaterThan(0);
  });
});

describe('fingerprintToText', () => {
  test('generates text for embedding', () => {
    const fp: DetectedRepo = {
      root: '/test',
      name: 'test-project',
      languages: ['typescript', 'python'],
      frameworks: ['express', 'fastapi'],
      dependencies: ['lodash', 'axios'],
      patterns: ['api', 'monorepo'],
      testFramework: 'jest',
    };

    const text = fingerprintToText(fp);

    expect(text).toContain('project: test-project');
    expect(text).toContain('languages: typescript, python');
    expect(text).toContain('frameworks: express, fastapi');
    expect(text).toContain('patterns: api, monorepo');
  });

  test('handles empty arrays gracefully', () => {
    const fp: DetectedRepo = {
      root: '/test',
      name: 'empty-project',
      languages: [],
      frameworks: [],
      dependencies: [],
      patterns: [],
      testFramework: null,
    };

    const text = fingerprintToText(fp);
    expect(text).toContain('project: empty-project');
    // Should not have "languages: " with nothing after
  });
});

describe('framework detection', () => {
  test('detects MCP SDK in matrix', () => {
    const fp = fingerprintRepo();
    expect(fp.dependencies).toContain('@modelcontextprotocol/sdk');
  });

  test('detects xenova transformers', () => {
    const fp = fingerprintRepo();
    expect(fp.dependencies).toContain('@xenova/transformers');
  });
});

describe('pattern detection', () => {
  test('matrix is not a monorepo', () => {
    const fp = fingerprintRepo();
    expect(fp.patterns).not.toContain('monorepo');
  });
});
