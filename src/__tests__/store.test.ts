import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTestDb, closeTestDb, mockEmbedding, embeddingToBuffer } from './helpers.js';

let mockDb: ReturnType<typeof createTestDb>;

describe('solution storage', () => {
  beforeEach(() => {
    mockDb = createTestDb();
  });

  afterEach(() => {
    closeTestDb();
  });

  test('stores solution with all fields', () => {
    const emb = mockEmbedding(384, 1);
    const embBuffer = embeddingToBuffer(emb);
    const tags = JSON.stringify(['auth', 'oauth']);
    const context = JSON.stringify({ filesAffected: ['auth.ts'] });

    mockDb.query(`
      INSERT INTO solutions (id, problem, problem_embedding, solution, scope, context, tags, score)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0.5)
    `).run('sol_001', 'OAuth integration', embBuffer, 'Use passport.js', 'global', context, tags);

    const solution = mockDb.query('SELECT * FROM solutions WHERE id = ?').get('sol_001') as {
      id: string;
      problem: string;
      solution: string;
      scope: string;
      tags: string;
      score: number;
    };

    expect(solution.id).toBe('sol_001');
    expect(solution.problem).toBe('OAuth integration');
    expect(solution.solution).toBe('Use passport.js');
    expect(solution.scope).toBe('global');
    expect(JSON.parse(solution.tags)).toEqual(['auth', 'oauth']);
    expect(solution.score).toBe(0.5);
  });

  test('generates unique IDs', () => {
    const id1 = `sol_${crypto.randomUUID().slice(0, 8)}`;
    const id2 = `sol_${crypto.randomUUID().slice(0, 8)}`;
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^sol_[a-f0-9]{8}$/);
  });

  test('handles empty tags', () => {
    const emb = mockEmbedding(384, 1);
    const embBuffer = embeddingToBuffer(emb);

    mockDb.query(`
      INSERT INTO solutions (id, problem, problem_embedding, solution, scope, tags, score)
      VALUES (?, ?, ?, ?, ?, ?, 0.5)
    `).run('sol_001', 'Problem', embBuffer, 'Solution', 'global', '[]');

    const solution = mockDb.query('SELECT tags FROM solutions WHERE id = ?').get('sol_001') as { tags: string };
    expect(JSON.parse(solution.tags)).toEqual([]);
  });

  test('enforces scope constraint', () => {
    const emb = mockEmbedding(384, 1);
    const embBuffer = embeddingToBuffer(emb);

    expect(() => {
      mockDb.query(`
        INSERT INTO solutions (id, problem, problem_embedding, solution, scope, score)
        VALUES (?, ?, ?, ?, ?, 0.5)
      `).run('sol_001', 'Problem', embBuffer, 'Solution', 'invalid');
    }).toThrow();
  });

  test('stores with default values', () => {
    const emb = mockEmbedding(384, 1);
    const embBuffer = embeddingToBuffer(emb);

    mockDb.query(`
      INSERT INTO solutions (id, problem, problem_embedding, solution, scope)
      VALUES (?, ?, ?, ?, ?)
    `).run('sol_001', 'Problem', embBuffer, 'Solution', 'global');

    const solution = mockDb.query('SELECT score, uses, successes, failures FROM solutions WHERE id = ?').get('sol_001') as {
      score: number;
      uses: number;
      successes: number;
      failures: number;
    };

    expect(solution.score).toBe(0.5);
    expect(solution.uses).toBe(0);
    expect(solution.successes).toBe(0);
    expect(solution.failures).toBe(0);
  });
});
