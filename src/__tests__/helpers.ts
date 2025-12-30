import { Database } from 'bun:sqlite';
import { SCHEMA_SQL } from '../db/schema.js';

let testDb: Database | null = null;

export function createTestDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  testDb = db;
  return db;
}

export function getTestDb(): Database {
  if (!testDb) {
    throw new Error('Test database not initialized. Call createTestDb() first.');
  }
  return testDb;
}

export function closeTestDb(): void {
  if (testDb) {
    testDb.close();
    testDb = null;
  }
}

export function mockEmbedding(dim = 384, seed = 0): Float32Array {
  const arr = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    // Deterministic "random" based on seed and index
    arr[i] = Math.sin(seed * 1000 + i) * 0.5 + 0.5;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    const val = arr[i];
    if (val !== undefined) norm += val * val;
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < dim; i++) {
    const val = arr[i];
    if (val !== undefined) arr[i] = val / norm;
  }
  return arr;
}

export function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer);
}

export function seedSolution(
  db: Database,
  id: string,
  problem: string,
  solution: string,
  scope: 'global' | 'stack' | 'repo' = 'global',
  embedding?: Float32Array
): void {
  const emb = embedding ?? mockEmbedding(384, id.charCodeAt(0));
  const embBuffer = embeddingToBuffer(emb);

  db.query(`
    INSERT INTO solutions (id, problem, problem_embedding, solution, scope, context, tags, score)
    VALUES (?, ?, ?, ?, ?, '{}', '[]', 0.5)
  `).run(id, problem, embBuffer, solution, scope);
}

export function seedFailure(
  db: Database,
  id: string,
  errorType: 'runtime' | 'build' | 'test' | 'type' | 'other',
  errorMessage: string,
  rootCause: string,
  fixApplied: string,
  signature: string,
  embedding?: Float32Array
): void {
  const emb = embedding ?? mockEmbedding(384, id.charCodeAt(0));
  const embBuffer = embeddingToBuffer(emb);

  db.query(`
    INSERT INTO failures (id, error_type, error_message, error_signature, error_embedding, root_cause, fix_applied)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, errorType, errorMessage, signature, embBuffer, rootCause, fixApplied);
}

// Create corrupted embedding buffer (wrong size)
export function corruptedEmbeddingBuffer(): Buffer {
  return Buffer.from(new Float32Array([1, 2, 3]).buffer); // Only 3 dimensions instead of 384
}

// Create embedding with wrong dimensions
export function wrongDimensionEmbedding(dim = 100): Float32Array {
  return mockEmbedding(dim, 0);
}

// Seed solution with corrupted embedding for testing error handling
export function seedCorruptedSolution(
  db: Database,
  id: string,
  problem: string,
  solution: string
): void {
  const corruptedBuffer = corruptedEmbeddingBuffer();
  db.query(`
    INSERT INTO solutions (id, problem, problem_embedding, solution, scope, context, tags, score)
    VALUES (?, ?, ?, ?, 'global', '{}', '[]', 0.5)
  `).run(id, problem, corruptedBuffer, solution);
}

// Seed failure with corrupted embedding for testing error handling
export function seedCorruptedFailure(
  db: Database,
  id: string,
  errorType: 'runtime' | 'build' | 'test' | 'type' | 'other',
  errorMessage: string,
  rootCause: string,
  fixApplied: string,
  signature: string
): void {
  const corruptedBuffer = corruptedEmbeddingBuffer();
  db.query(`
    INSERT INTO failures (id, error_type, error_message, error_signature, error_embedding, root_cause, fix_applied)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, errorType, errorMessage, signature, corruptedBuffer, rootCause, fixApplied);
}
