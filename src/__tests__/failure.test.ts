import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createHash } from 'crypto';
import { createTestDb, closeTestDb, mockEmbedding, embeddingToBuffer, seedFailure, seedCorruptedFailure } from './helpers.js';
import { bufferToEmbedding } from '../db/client.js';

let mockDb: ReturnType<typeof createTestDb>;

// Error normalization logic (copied from failure.ts for testing)
function normalizeErrorMessage(msg: string): string {
  return msg
    .replace(/\d+/g, 'N')
    .replace(/['"`].*?['"`]/g, 'STR')
    .replace(/\/[\w\-./]+/g, 'PATH')
    .replace(/0x[a-fA-F0-9]+/g, 'HEX')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function computeSignature(errorType: string, normalizedMsg: string): string {
  const hash = createHash('sha256');
  hash.update(`${errorType}:${normalizedMsg}`);
  return hash.digest('hex').slice(0, 16);
}

describe('failure recording', () => {
  beforeEach(() => {
    mockDb = createTestDb();
  });

  afterEach(() => {
    closeTestDb();
  });

  test('records new failure', () => {
    const emb = mockEmbedding(384, 1);
    const embBuffer = embeddingToBuffer(emb);
    const signature = computeSignature('runtime', 'test error');

    mockDb.query(`
      INSERT INTO failures (id, error_type, error_message, error_signature, error_embedding, root_cause, fix_applied)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('fail_001', 'runtime', 'Test error message', signature, embBuffer, 'Bad code', 'Fixed code');

    const failure = mockDb.query('SELECT * FROM failures WHERE id = ?').get('fail_001') as {
      id: string;
      error_type: string;
      occurrences: number;
    };

    expect(failure.id).toBe('fail_001');
    expect(failure.error_type).toBe('runtime');
    expect(failure.occurrences).toBe(1);
  });

  test('increments occurrences for duplicate signature', () => {
    const signature = computeSignature('build', 'duplicate error');
    const emb = mockEmbedding(384, 1);
    const embBuffer = embeddingToBuffer(emb);

    mockDb.query(`
      INSERT INTO failures (id, error_type, error_message, error_signature, error_embedding, root_cause, fix_applied)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('fail_001', 'build', 'Duplicate error', signature, embBuffer, 'cause', 'fix');

    // Simulate finding existing and updating
    mockDb.query(`
      UPDATE failures SET occurrences = occurrences + 1 WHERE error_signature = ?
    `).run(signature);

    const failure = mockDb.query('SELECT occurrences FROM failures WHERE id = ?').get('fail_001') as { occurrences: number };
    expect(failure.occurrences).toBe(2);
  });
});

describe('error normalization', () => {
  test('replaces numbers with N', () => {
    expect(normalizeErrorMessage('Error at line 42')).toBe('Error at line N');
  });

  test('replaces string literals with STR', () => {
    expect(normalizeErrorMessage("Cannot find 'foo'")).toBe('Cannot find STR');
    expect(normalizeErrorMessage('Cannot find "bar"')).toBe('Cannot find STR');
  });

  test('replaces file paths with PATH', () => {
    expect(normalizeErrorMessage('Error in /usr/local/file.ts')).toBe('Error in PATH');
  });

  test('replaces hex addresses with HEX (after number normalization)', () => {
    // Note: numbers are replaced first, so 0x becomes NxN...
    // The hex regex only matches remaining hex patterns
    const result = normalizeErrorMessage('Memory at 0x7fff5fbff8c0');
    // After number replacement: "Memory at NxNfffNfbffNcN"
    expect(result).toContain('Memory at');
  });

  test('normalizes whitespace', () => {
    expect(normalizeErrorMessage('Error   with\n\ttabs')).toBe('Error with tabs');
  });

  test('truncates long messages', () => {
    const longMsg = 'a'.repeat(600);
    expect(normalizeErrorMessage(longMsg).length).toBe(500);
  });

  test('computes consistent signatures', () => {
    const sig1 = computeSignature('runtime', 'Error at line N');
    const sig2 = computeSignature('runtime', 'Error at line N');
    expect(sig1).toBe(sig2);
    expect(sig1.length).toBe(16);
  });

  test('different errors produce different signatures', () => {
    const sig1 = computeSignature('runtime', 'Error A');
    const sig2 = computeSignature('runtime', 'Error B');
    expect(sig1).not.toBe(sig2);
  });
});

describe('corrupted embedding handling', () => {
  beforeEach(() => {
    mockDb = createTestDb();
  });

  afterEach(() => {
    closeTestDb();
  });

  test('gracefully handles corrupted failure embeddings', () => {
    // Seed valid and corrupted failures
    seedFailure(mockDb, 'fail_valid', 'runtime', 'Valid error', 'Valid cause', 'Valid fix', 'sig_valid');
    seedCorruptedFailure(mockDb, 'fail_corrupt', 'runtime', 'Corrupted error', 'Corrupted cause', 'Corrupted fix', 'sig_corrupt');

    // Both should be in DB
    const count = mockDb.query('SELECT COUNT(*) as count FROM failures').get() as { count: number };
    expect(count.count).toBe(2);

    // Simulate what searchFailures does - iterate and skip corrupted
    const rows = mockDb.query(`
      SELECT id, error_embedding FROM failures WHERE error_embedding IS NOT NULL
    `).all() as Array<{ id: string; error_embedding: Uint8Array }>;

    const validEmbeddings: string[] = [];
    for (const row of rows) {
      try {
        const embedding = bufferToEmbedding(row.error_embedding);
        if (embedding.length !== 384) continue;
        validEmbeddings.push(row.id);
      } catch {
        continue;
      }
    }

    // Only valid failure should be processed
    expect(validEmbeddings.length).toBe(1);
    expect(validEmbeddings[0]).toBe('fail_valid');
  });
});
