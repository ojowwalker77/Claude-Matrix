import { getDb, embeddingToBuffer } from '../db/client.js';
import { getEmbedding } from '../embeddings/local.js';
import { randomUUID } from 'crypto';
import { fingerprintRepo, getOrCreateRepo } from '../repo/index.js';

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

  // Get current repo context
  const detected = fingerprintRepo();
  const repoId = await getOrCreateRepo(detected);

  // Generate embedding for semantic search
  const embedding = await getEmbedding(input.problem);
  const embBuffer = embeddingToBuffer(embedding);

  const context = JSON.stringify({
    filesAffected: input.filesAffected || [],
  });

  const tags = JSON.stringify(input.tags || []);

  db.query(`
    INSERT INTO solutions (id, repo_id, problem, problem_embedding, solution, scope, context, tags, score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.5)
  `).run(id, repoId, input.problem, embBuffer, input.solution, input.scope, context, tags);

  return {
    id,
    status: 'stored',
    problem: input.problem.slice(0, 100) + (input.problem.length > 100 ? '...' : ''),
    scope: input.scope,
    tags: input.tags || [],
  };
}
