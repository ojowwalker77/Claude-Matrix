import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  createTestDb,
  closeTestDb,
  mockEmbedding,
  embeddingToBuffer,
  seedSolution,
  seedCorruptedSolution,
  seedFailure,
  seedCorruptedFailure,
} from './helpers.js';
import { bufferToEmbedding } from '../db/client.js';
import { cosineSimilarity, EMBEDDING_DIM } from '../embeddings/utils.js';

let mockDb: ReturnType<typeof createTestDb>;

/**
 * Test the batch processing logic used by searchSimilarSolutions/searchSimilarFailures
 * These tests verify the algorithm without calling the actual functions (which use getDb())
 */
describe('solution batch search logic', () => {
  beforeEach(() => {
    mockDb = createTestDb();
  });

  afterEach(() => {
    closeTestDb();
  });

  test('filters results below minScore threshold', () => {
    // Create orthogonal embeddings for low similarity
    const storedEmb = new Float32Array(EMBEDDING_DIM);
    storedEmb[0] = 1.0; // Unit vector in first dimension
    const storedBuffer = embeddingToBuffer(storedEmb);

    mockDb.query(`
      INSERT INTO solutions (id, problem, problem_embedding, solution, scope, context, tags, score)
      VALUES (?, ?, ?, ?, 'global', '{}', '[]', 0.5)
    `).run('sol_001', 'Problem', storedBuffer, 'Solution');

    // Query with orthogonal vector (second dimension)
    const queryEmb = new Float32Array(EMBEDDING_DIM);
    queryEmb[1] = 1.0; // Orthogonal to stored

    const minScore = 0.5; // Threshold above 0 (orthogonal similarity)

    const rows = mockDb.query(`
      SELECT id, problem_embedding FROM solutions
      WHERE problem_embedding IS NOT NULL
    `).all() as Array<{ id: string; problem_embedding: Uint8Array }>;

    const results: Array<{ id: string; similarity: number }> = [];
    for (const row of rows) {
      try {
        const embedding = bufferToEmbedding(row.problem_embedding);
        if (embedding.length !== EMBEDDING_DIM) continue;
        const similarity = cosineSimilarity(queryEmb, embedding);
        if (similarity >= minScore) {
          results.push({ id: row.id, similarity });
        }
      } catch {
        continue;
      }
    }

    // Orthogonal vectors have similarity ~0, should be filtered out
    expect(results.length).toBe(0);
  });

  test('respects limit parameter', () => {
    // Seed multiple solutions with similar embeddings
    for (let i = 0; i < 10; i++) {
      seedSolution(mockDb, `sol_${i.toString().padStart(3, '0')}`, `Problem ${i}`, `Solution ${i}`, 'global');
    }

    const queryEmb = mockEmbedding(EMBEDDING_DIM, 0); // Similar to default seed
    const minScore = 0.1;
    const limit = 3;

    const rows = mockDb.query(`
      SELECT id, problem_embedding FROM solutions
      WHERE problem_embedding IS NOT NULL
    `).all() as Array<{ id: string; problem_embedding: Uint8Array }>;

    const results: Array<{ id: string; similarity: number }> = [];
    for (const row of rows) {
      try {
        const embedding = bufferToEmbedding(row.problem_embedding);
        if (embedding.length !== EMBEDDING_DIM) continue;
        const similarity = cosineSimilarity(queryEmb, embedding);
        if (similarity >= minScore) {
          results.push({ id: row.id, similarity });
        }
      } catch {
        continue;
      }
    }
    results.sort((a, b) => b.similarity - a.similarity);
    const limited = results.slice(0, limit);

    expect(limited.length).toBeLessThanOrEqual(3);
  });

  test('skips corrupted embeddings gracefully', () => {
    seedSolution(mockDb, 'sol_valid', 'Valid problem', 'Valid solution', 'global');
    seedCorruptedSolution(mockDb, 'sol_corrupt', 'Corrupted problem', 'Corrupted solution');

    const queryEmb = mockEmbedding(EMBEDDING_DIM, 0);
    const minScore = 0.1;

    const rows = mockDb.query(`
      SELECT id, problem_embedding FROM solutions
      WHERE problem_embedding IS NOT NULL
    `).all() as Array<{ id: string; problem_embedding: Uint8Array }>;

    const validIds: string[] = [];
    for (const row of rows) {
      try {
        const embedding = bufferToEmbedding(row.problem_embedding);
        if (embedding.length !== EMBEDDING_DIM) continue;
        const similarity = cosineSimilarity(queryEmb, embedding);
        if (similarity >= minScore) {
          validIds.push(row.id);
        }
      } catch {
        continue;
      }
    }

    expect(validIds).toContain('sol_valid');
    expect(validIds).not.toContain('sol_corrupt');
  });

  test('skips wrong dimension embeddings', () => {
    seedSolution(mockDb, 'sol_valid', 'Valid problem', 'Valid solution', 'global');

    // Seed solution with wrong dimension embedding (100 instead of 384)
    const wrongDimEmb = mockEmbedding(100, 42);
    const wrongDimBuffer = embeddingToBuffer(wrongDimEmb);
    mockDb.query(`
      INSERT INTO solutions (id, problem, problem_embedding, solution, scope, context, tags, score)
      VALUES (?, ?, ?, ?, 'global', '{}', '[]', 0.5)
    `).run('sol_wrong_dim', 'Wrong dim problem', wrongDimBuffer, 'Wrong dim solution');

    const queryEmb = mockEmbedding(EMBEDDING_DIM, 0);
    const minScore = 0.1;

    const rows = mockDb.query(`
      SELECT id, problem_embedding FROM solutions
      WHERE problem_embedding IS NOT NULL
    `).all() as Array<{ id: string; problem_embedding: Uint8Array }>;

    const validIds: string[] = [];
    for (const row of rows) {
      try {
        const embedding = bufferToEmbedding(row.problem_embedding);
        if (embedding.length !== EMBEDDING_DIM) continue;
        const similarity = cosineSimilarity(queryEmb, embedding);
        if (similarity >= minScore) {
          validIds.push(row.id);
        }
      } catch {
        continue;
      }
    }

    expect(validIds).toContain('sol_valid');
    expect(validIds).not.toContain('sol_wrong_dim');
  });

  test('sorts results by similarity descending', () => {
    // Create base embedding
    const baseEmb = mockEmbedding(EMBEDDING_DIM, 1);

    // Create a similar embedding (slightly perturbed)
    const similarEmb = new Float32Array(EMBEDDING_DIM);
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      similarEmb[i] = baseEmb[i]! + (Math.random() - 0.5) * 0.05;
    }
    // Normalize
    let norm = 0;
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      norm += similarEmb[i]! * similarEmb[i]!;
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      similarEmb[i] = similarEmb[i]! / norm;
    }

    // Seed two solutions: one very similar, one different
    seedSolution(mockDb, 'sol_similar', 'Similar problem', 'Similar solution', 'global', similarEmb);
    seedSolution(mockDb, 'sol_different', 'Different problem', 'Different solution', 'global', mockEmbedding(EMBEDDING_DIM, 999));

    const minScore = 0.1;

    const rows = mockDb.query(`
      SELECT id, problem_embedding FROM solutions
      WHERE problem_embedding IS NOT NULL
    `).all() as Array<{ id: string; problem_embedding: Uint8Array }>;

    const results: Array<{ id: string; similarity: number }> = [];
    for (const row of rows) {
      try {
        const embedding = bufferToEmbedding(row.problem_embedding);
        if (embedding.length !== EMBEDDING_DIM) continue;
        const similarity = cosineSimilarity(baseEmb, embedding);
        if (similarity >= minScore) {
          results.push({ id: row.id, similarity });
        }
      } catch {
        continue;
      }
    }
    results.sort((a, b) => b.similarity - a.similarity);

    expect(results.length).toBeGreaterThanOrEqual(1);
    if (results.length >= 2) {
      expect(results[0]!.similarity).toBeGreaterThan(results[1]!.similarity);
      expect(results[0]!.id).toBe('sol_similar');
    }
  });
});

describe('failure batch search logic', () => {
  beforeEach(() => {
    mockDb = createTestDb();
  });

  afterEach(() => {
    closeTestDb();
  });

  test('filters results below minScore threshold', () => {
    // Create orthogonal embeddings for low similarity
    const storedEmb = new Float32Array(EMBEDDING_DIM);
    storedEmb[0] = 1.0; // Unit vector in first dimension
    const storedBuffer = embeddingToBuffer(storedEmb);

    mockDb.query(`
      INSERT INTO failures (id, error_type, error_message, error_signature, error_embedding, root_cause, fix_applied)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('fail_001', 'runtime', 'Error', 'sig001', storedBuffer, 'Root', 'Fix');

    // Query with orthogonal vector (second dimension)
    const queryEmb = new Float32Array(EMBEDDING_DIM);
    queryEmb[1] = 1.0;

    const minScore = 0.5;

    const rows = mockDb.query(`
      SELECT id, error_embedding FROM failures
      WHERE error_embedding IS NOT NULL
    `).all() as Array<{ id: string; error_embedding: Uint8Array }>;

    const results: Array<{ id: string; similarity: number }> = [];
    for (const row of rows) {
      try {
        const embedding = bufferToEmbedding(row.error_embedding);
        if (embedding.length !== EMBEDDING_DIM) continue;
        const similarity = cosineSimilarity(queryEmb, embedding);
        if (similarity >= minScore) {
          results.push({ id: row.id, similarity });
        }
      } catch {
        continue;
      }
    }

    expect(results.length).toBe(0);
  });

  test('respects limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      seedFailure(mockDb, `fail_${i.toString().padStart(3, '0')}`, 'runtime', `Error ${i}`, 'Root', 'Fix', `sig${i}`);
    }

    const queryEmb = mockEmbedding(EMBEDDING_DIM, 0);
    const minScore = 0.1;
    const limit = 3;

    const rows = mockDb.query(`
      SELECT id, error_embedding FROM failures
      WHERE error_embedding IS NOT NULL
    `).all() as Array<{ id: string; error_embedding: Uint8Array }>;

    const results: Array<{ id: string; similarity: number }> = [];
    for (const row of rows) {
      try {
        const embedding = bufferToEmbedding(row.error_embedding);
        if (embedding.length !== EMBEDDING_DIM) continue;
        const similarity = cosineSimilarity(queryEmb, embedding);
        if (similarity >= minScore) {
          results.push({ id: row.id, similarity });
        }
      } catch {
        continue;
      }
    }
    results.sort((a, b) => b.similarity - a.similarity);
    const limited = results.slice(0, limit);

    expect(limited.length).toBeLessThanOrEqual(3);
  });

  test('skips corrupted embeddings gracefully', () => {
    seedFailure(mockDb, 'fail_valid', 'runtime', 'Valid error', 'Root', 'Fix', 'sig_valid');
    seedCorruptedFailure(mockDb, 'fail_corrupt', 'runtime', 'Corrupted', 'Root', 'Fix', 'sig_corrupt');

    const queryEmb = mockEmbedding(EMBEDDING_DIM, 0);
    const minScore = 0.1;

    const rows = mockDb.query(`
      SELECT id, error_embedding FROM failures
      WHERE error_embedding IS NOT NULL
    `).all() as Array<{ id: string; error_embedding: Uint8Array }>;

    const validIds: string[] = [];
    for (const row of rows) {
      try {
        const embedding = bufferToEmbedding(row.error_embedding);
        if (embedding.length !== EMBEDDING_DIM) continue;
        const similarity = cosineSimilarity(queryEmb, embedding);
        if (similarity >= minScore) {
          validIds.push(row.id);
        }
      } catch {
        continue;
      }
    }

    expect(validIds).not.toContain('fail_corrupt');
  });

  test('sorts results by similarity descending', () => {
    const baseEmb = mockEmbedding(EMBEDDING_DIM, 1);

    // Create similar embedding
    const similarEmb = new Float32Array(EMBEDDING_DIM);
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      similarEmb[i] = baseEmb[i]! + (Math.random() - 0.5) * 0.05;
    }
    let norm = 0;
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      norm += similarEmb[i]! * similarEmb[i]!;
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      similarEmb[i] = similarEmb[i]! / norm;
    }

    seedFailure(mockDb, 'fail_similar', 'runtime', 'Similar error', 'Root', 'Fix', 'sig_sim', similarEmb);
    seedFailure(mockDb, 'fail_different', 'runtime', 'Different error', 'Root', 'Fix', 'sig_diff', mockEmbedding(EMBEDDING_DIM, 999));

    const minScore = 0.1;

    const rows = mockDb.query(`
      SELECT id, error_embedding FROM failures
      WHERE error_embedding IS NOT NULL
    `).all() as Array<{ id: string; error_embedding: Uint8Array }>;

    const results: Array<{ id: string; similarity: number }> = [];
    for (const row of rows) {
      try {
        const embedding = bufferToEmbedding(row.error_embedding);
        if (embedding.length !== EMBEDDING_DIM) continue;
        const similarity = cosineSimilarity(baseEmb, embedding);
        if (similarity >= minScore) {
          results.push({ id: row.id, similarity });
        }
      } catch {
        continue;
      }
    }
    results.sort((a, b) => b.similarity - a.similarity);

    if (results.length >= 2) {
      expect(results[0]!.similarity).toBeGreaterThan(results[1]!.similarity);
    }
  });
});
