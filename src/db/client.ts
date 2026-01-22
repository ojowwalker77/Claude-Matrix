import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { cosineSimilarity, EMBEDDING_DIM } from '../embeddings/utils.js';
import { runMigrations } from './migrate.js';

let db: Database | null = null;

// Default to ~/.claude/matrix/matrix.db (plugin standard location)
function getDefaultDbPath(): string {
  const matrixDir = join(homedir(), '.claude', 'matrix');
  if (!existsSync(matrixDir)) {
    mkdirSync(matrixDir, { recursive: true });
  }
  return join(matrixDir, 'matrix.db');
}

export function getDb(): Database {
  if (db) return db;

  const dbPath = process.env['MATRIX_DB'] || getDefaultDbPath();

  // Run migrations (handles both fresh DB and upgrades)
  runMigrations();

  db = new Database(dbPath, { create: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  return db;
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

// Re-export for backwards compatibility
export { cosineSimilarity };

// Search similar solutions by embedding (batch processing to avoid memory issues)
export function searchSimilarSolutions(
  queryEmbedding: Float32Array,
  limit: number = 10,
  minScore: number = 0.3
): Array<{ id: string; similarity: number }> {
  const db = getDb();
  const BATCH_SIZE = 1000;
  let offset = 0;
  const results: Array<{ id: string; similarity: number }> = [];

  while (true) {
    const rows = db.query(`
      SELECT id, problem_embedding FROM solutions
      WHERE problem_embedding IS NOT NULL
      LIMIT ? OFFSET ?
    `).all(BATCH_SIZE, offset) as Array<{ id: string; problem_embedding: Uint8Array }>;

    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        const embedding = bufferToEmbedding(row.problem_embedding);
        if (embedding.length !== EMBEDDING_DIM) continue;
        const similarity = cosineSimilarity(queryEmbedding, embedding);

        if (similarity >= minScore) {
          results.push({ id: row.id, similarity });
        }
      } catch {
        continue;
      }
    }

    offset += BATCH_SIZE;
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}

// Search similar failures by embedding (batch processing to avoid memory issues)
export function searchSimilarFailures(
  queryEmbedding: Float32Array,
  limit: number = 5,
  minScore: number = 0.5
): Array<{ id: string; similarity: number }> {
  const db = getDb();
  const BATCH_SIZE = 1000;
  let offset = 0;
  const results: Array<{ id: string; similarity: number }> = [];

  while (true) {
    const rows = db.query(`
      SELECT id, error_embedding FROM failures
      WHERE error_embedding IS NOT NULL
      LIMIT ? OFFSET ?
    `).all(BATCH_SIZE, offset) as Array<{ id: string; error_embedding: Uint8Array }>;

    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        const embedding = bufferToEmbedding(row.error_embedding);
        if (embedding.length !== EMBEDDING_DIM) continue;
        const similarity = cosineSimilarity(queryEmbedding, embedding);

        if (similarity >= minScore) {
          results.push({ id: row.id, similarity });
        }
      } catch {
        continue;
      }
    }

    offset += BATCH_SIZE;
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}
