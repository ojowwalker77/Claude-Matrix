import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTestDb, closeTestDb, mockEmbedding, embeddingToBuffer, seedSolution } from './helpers.js';
import { cosineSimilarity } from '../embeddings/index.js';

let mockDb: ReturnType<typeof createTestDb>;

describe('solution recall', () => {
  beforeEach(() => {
    mockDb = createTestDb();
  });

  afterEach(() => {
    closeTestDb();
  });

  test('returns matching solutions', () => {
    seedSolution(mockDb, 'sol_001', 'OAuth integration with Google', 'Use passport-google-oauth20', 'global');
    seedSolution(mockDb, 'sol_002', 'Database connection pooling', 'Use pg-pool', 'global');

    const rows = mockDb.query('SELECT id, problem FROM solutions').all() as Array<{ id: string; problem: string }>;
    expect(rows.length).toBe(2);
  });

  test('respects scope filter', () => {
    seedSolution(mockDb, 'sol_001', 'Global solution', 'Works everywhere', 'global');
    seedSolution(mockDb, 'sol_002', 'Stack solution', 'Works for this stack', 'stack');
    seedSolution(mockDb, 'sol_003', 'Repo solution', 'Works for this repo only', 'repo');

    const globalOnly = mockDb.query('SELECT id FROM solutions WHERE scope = ?').all('global') as Array<{ id: string }>;
    expect(globalOnly.length).toBe(1);
    expect(globalOnly[0]?.id).toBe('sol_001');

    const stackOnly = mockDb.query('SELECT id FROM solutions WHERE scope = ?').all('stack') as Array<{ id: string }>;
    expect(stackOnly.length).toBe(1);
  });

  test('updates usage count on recall', () => {
    seedSolution(mockDb, 'sol_001', 'Test problem', 'Test solution', 'global');

    // Simulate recall updating usage
    mockDb.query(`UPDATE solutions SET uses = uses + 1, last_used_at = datetime('now') WHERE id = ?`).run('sol_001');

    const solution = mockDb.query('SELECT uses, last_used_at FROM solutions WHERE id = ?').get('sol_001') as {
      uses: number;
      last_used_at: string;
    };

    expect(solution.uses).toBe(1);
    expect(solution.last_used_at).not.toBeNull();
  });

  test('calculates correct success rate', () => {
    seedSolution(mockDb, 'sol_001', 'Test problem', 'Test solution', 'global');

    // Add some outcomes
    mockDb.query('UPDATE solutions SET successes = 7, failures = 3 WHERE id = ?').run('sol_001');

    const solution = mockDb.query('SELECT successes, failures FROM solutions WHERE id = ?').get('sol_001') as {
      successes: number;
      failures: number;
    };

    const successRate = solution.successes / (solution.successes + solution.failures);
    expect(successRate).toBeCloseTo(0.7, 5);
  });

  test('similarity scoring works correctly', () => {
    // Create two similar embeddings and one different
    const baseEmb = mockEmbedding(384, 1);
    const similarEmb = new Float32Array(384);
    const differentEmb = mockEmbedding(384, 999);

    // Make similar embedding close to base
    for (let i = 0; i < 384; i++) {
      const val = baseEmb[i];
      if (val !== undefined) similarEmb[i] = val + (Math.random() - 0.5) * 0.1;
    }

    const similarity1 = cosineSimilarity(baseEmb, similarEmb);
    const similarity2 = cosineSimilarity(baseEmb, differentEmb);

    expect(similarity1).toBeGreaterThan(similarity2);
    expect(similarity1).toBeGreaterThan(0.8); // Similar vectors should have high similarity
  });

  test('parameterized query prevents SQL injection', () => {
    seedSolution(mockDb, 'sol_001', 'Test problem', 'Test solution', 'global');

    // This would be dangerous with string interpolation
    const maliciousScope = "global'; DROP TABLE solutions; --";

    // With parameterized query, this should just not match anything (or throw)
    const result = mockDb.query('SELECT * FROM solutions WHERE scope = ?').all(maliciousScope) as unknown[];

    // Table should still exist and have our solution
    const count = mockDb.query('SELECT COUNT(*) as count FROM solutions').get() as { count: number };
    expect(count.count).toBe(1);
    expect(result.length).toBe(0);
  });
});
