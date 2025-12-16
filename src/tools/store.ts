import { getDb, embeddingToBuffer } from '../db/client.js';
import { getEmbedding } from '../embeddings/local.js';
import { randomUUID } from 'crypto';

interface StoreInput {
  problem: string;
  solution: string;
  scope: 'global' | 'stack' | 'repo';
  tags?: string[];
  filesAffected?: string[];
}

interface StoreResult {
  id: string;
  status: 'stored';
  problem: string;
  scope: string;
  tags: string[];
}

export async function matrixStore(input: StoreInput): Promise<StoreResult> {
  const db = getDb();
  const id = `sol_${randomUUID().slice(0, 8)}`;

  // Generate embedding for semantic search
  const embedding = await getEmbedding(input.problem);
  const embBuffer = embeddingToBuffer(embedding);

  const context = JSON.stringify({
    filesAffected: input.filesAffected || [],
  });

  const tags = JSON.stringify(input.tags || []);

  db.query(`
    INSERT INTO solutions (id, problem, problem_embedding, solution, scope, context, tags, score)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0.5)
  `).run(id, input.problem, embBuffer, input.solution, input.scope, context, tags);

  return {
    id,
    status: 'stored',
    problem: input.problem.slice(0, 100) + (input.problem.length > 100 ? '...' : ''),
    scope: input.scope,
    tags: input.tags || [],
  };
}
