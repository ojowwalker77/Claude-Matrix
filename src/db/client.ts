import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;

  const dbPath = process.env['MATRIX_DB'] || join(__dirname, '../../matrix.db');

  db = new Database(dbPath, { create: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  initSchema();

  return db;
}

function initSchema(): void {
  if (!db) throw new Error('Database not initialized');

  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  db.exec(schema);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Embedding helpers - store as BLOB, search in JS
export function embeddingToBuffer(embedding: Float32Array | number[]): Buffer {
  const arr = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
  return Buffer.from(arr.buffer);
}

export function bufferToEmbedding(buffer: Buffer | Uint8Array): Float32Array {
  if (buffer instanceof Uint8Array && !(buffer instanceof Buffer)) {
    buffer = Buffer.from(buffer);
  }
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
}

// Cosine similarity for vector search (done in JS since sqlite-vec doesn't work with bun:sqlite)
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// Search similar solutions by embedding (brute force, fine for <10k entries)
export function searchSimilarSolutions(
  queryEmbedding: Float32Array,
  limit: number = 10,
  minScore: number = 0.3
): Array<{ id: string; similarity: number }> {
  const db = getDb();

  const rows = db.query(`
    SELECT id, problem_embedding FROM solutions
    WHERE problem_embedding IS NOT NULL
  `).all() as Array<{ id: string; problem_embedding: Uint8Array }>;

  const results: Array<{ id: string; similarity: number }> = [];

  for (const row of rows) {
    const embedding = bufferToEmbedding(row.problem_embedding);
    const similarity = cosineSimilarity(queryEmbedding, embedding);

    if (similarity >= minScore) {
      results.push({ id: row.id, similarity });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}

// Search similar failures by embedding
export function searchSimilarFailures(
  queryEmbedding: Float32Array,
  limit: number = 5,
  minScore: number = 0.5
): Array<{ id: string; similarity: number }> {
  const db = getDb();

  const rows = db.query(`
    SELECT id, error_embedding FROM failures
    WHERE error_embedding IS NOT NULL
  `).all() as Array<{ id: string; error_embedding: Uint8Array }>;

  const results: Array<{ id: string; similarity: number }> = [];

  for (const row of rows) {
    const embedding = bufferToEmbedding(row.error_embedding);
    const similarity = cosineSimilarity(queryEmbedding, embedding);

    if (similarity >= minScore) {
      results.push({ id: row.id, similarity });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}
