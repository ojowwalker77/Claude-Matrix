import { getDb, embeddingToBuffer } from '../db/client.js';
import { getEmbedding } from '../embeddings/local.js';
import { createHash, randomUUID } from 'crypto';

interface FailureInput {
  errorType: 'runtime' | 'build' | 'test' | 'type' | 'other';
  errorMessage: string;
  stackTrace?: string;
  rootCause: string;
  fixApplied: string;
  prevention?: string;
  filesInvolved?: string[];
}

interface FailureResult {
  id: string;
  status: 'recorded' | 'updated';
  errorType: string;
  occurrences: number;
  message: string;
}

function normalizeErrorMessage(msg: string): string {
  // Remove line numbers, file paths, timestamps, and other variable parts
  return msg
    .replace(/\d+/g, 'N')                           // numbers -> N
    .replace(/['"`].*?['"`]/g, 'STR')               // string literals
    .replace(/\/[\w\-\.\/]+/g, 'PATH')              // file paths
    .replace(/0x[a-fA-F0-9]+/g, 'HEX')              // hex addresses
    .replace(/\s+/g, ' ')                            // normalize whitespace
    .trim()
    .slice(0, 500);
}

function computeSignature(errorType: string, normalizedMsg: string): string {
  const hash = createHash('sha256');
  hash.update(`${errorType}:${normalizedMsg}`);
  return hash.digest('hex').slice(0, 16);
}

export async function matrixFailure(input: FailureInput): Promise<FailureResult> {
  const db = getDb();

  const normalizedMsg = normalizeErrorMessage(input.errorMessage);
  const signature = computeSignature(input.errorType, normalizedMsg);

  // Check if we've seen this error before
  const existing = db.query(`
    SELECT id, occurrences FROM failures WHERE error_signature = ?
  `).get(signature) as { id: string; occurrences: number } | null;

  if (existing) {
    // Update existing failure
    db.query(`
      UPDATE failures
      SET occurrences = occurrences + 1,
          root_cause = COALESCE(?, root_cause),
          fix_applied = COALESCE(?, fix_applied),
          prevention = COALESCE(?, prevention),
          resolved_at = datetime('now')
      WHERE id = ?
    `).run(input.rootCause, input.fixApplied, input.prevention || null, existing.id);

    return {
      id: existing.id,
      status: 'updated',
      errorType: input.errorType,
      occurrences: existing.occurrences + 1,
      message: `Updated existing failure record (seen ${existing.occurrences + 1} times)`,
    };
  }

  // Create new failure record
  const id = `fail_${randomUUID().slice(0, 8)}`;

  // Generate embedding for semantic search
  const embedding = await getEmbedding(`${input.errorType}: ${input.errorMessage} ${input.rootCause}`);
  const embBuffer = embeddingToBuffer(embedding);

  const filesInvolved = JSON.stringify(input.filesInvolved || []);

  db.query(`
    INSERT INTO failures (
      id, error_type, error_message, error_signature, error_embedding,
      stack_trace, files_involved, root_cause, fix_applied, prevention, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    input.errorType,
    input.errorMessage,
    signature,
    embBuffer,
    input.stackTrace || null,
    filesInvolved,
    input.rootCause,
    input.fixApplied,
    input.prevention || null
  );

  return {
    id,
    status: 'recorded',
    errorType: input.errorType,
    occurrences: 1,
    message: 'New failure pattern recorded for future prevention',
  };
}

// Search for similar failures
export async function searchFailures(errorMessage: string, limit: number = 3): Promise<Array<{
  id: string;
  errorType: string;
  errorMessage: string;
  rootCause: string;
  fixApplied: string;
  similarity: number;
}>> {
  const db = getDb();
  const { bufferToEmbedding, cosineSimilarity } = await import('../db/client.js');

  const queryEmbedding = await getEmbedding(errorMessage);

  const rows = db.query(`
    SELECT id, error_type, error_message, error_embedding, root_cause, fix_applied
    FROM failures
    WHERE error_embedding IS NOT NULL AND fix_applied IS NOT NULL
  `).all() as Array<{
    id: string;
    error_type: string;
    error_message: string;
    error_embedding: Uint8Array;
    root_cause: string;
    fix_applied: string;
  }>;

  const matches: Array<{
    id: string;
    errorType: string;
    errorMessage: string;
    rootCause: string;
    fixApplied: string;
    similarity: number;
  }> = [];

  for (const row of rows) {
    const embedding = bufferToEmbedding(row.error_embedding);
    const similarity = cosineSimilarity(queryEmbedding, embedding);

    if (similarity >= 0.5) {
      matches.push({
        id: row.id,
        errorType: row.error_type,
        errorMessage: row.error_message,
        rootCause: row.root_cause,
        fixApplied: row.fix_applied,
        similarity: Math.round(similarity * 1000) / 1000,
      });
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity);
  return matches.slice(0, limit);
}
