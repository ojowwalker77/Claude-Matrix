import { getDb, bufferToEmbedding, cosineSimilarity } from '../db/client.js';
import { getEmbedding, EMBEDDING_DIM } from '../embeddings/local.js';
import { fingerprintRepo, getOrCreateRepo, getRepoEmbedding, getAllReposWithEmbeddings } from '../repo/index.js';

interface RecallInput {
  query: string;
  limit?: number;
  minScore?: number;
  scopeFilter?: 'all' | 'repo' | 'stack' | 'global';
}

interface SolutionMatch {
  id: string;
  problem: string;
  solution: string;
  scope: string;
  tags: string[];
  similarity: number;
  score: number;
  uses: number;
  successRate: number;
  contextBoost?: 'same_repo' | 'similar_stack';
}

interface RecallResult {
  query: string;
  solutions: SolutionMatch[];
  totalFound: number;
}

export async function matrixRecall(input: RecallInput): Promise<RecallResult> {
  const db = getDb();
  const limit = input.limit ?? 5;
  const minScore = input.minScore ?? 0.3;

  // Get current repo context
  const detected = fingerprintRepo();
  const currentRepoId = await getOrCreateRepo(detected);
  const currentRepoEmbedding = getRepoEmbedding(currentRepoId);

  // Build repo embedding cache for stack similarity
  const repoEmbeddings = new Map<string, Float32Array>();
  for (const { id, embedding } of getAllReposWithEmbeddings()) {
    repoEmbeddings.set(id, embedding);
  }

  // Generate embedding for query
  const queryEmbedding = await getEmbedding(input.query);

  // Get all solutions with embeddings
  const params: string[] = [];
  let query = `
    SELECT id, repo_id, problem, problem_embedding, solution, scope, tags, score, uses, successes, failures
    FROM solutions
    WHERE problem_embedding IS NOT NULL
  `;

  if (input.scopeFilter && input.scopeFilter !== 'all') {
    query += ` AND scope = ?`;
    params.push(input.scopeFilter);
  }

  const rows = db.query(query).all(...params) as Array<{
    id: string;
    repo_id: string | null;
    problem: string;
    problem_embedding: Uint8Array;
    solution: string;
    scope: string;
    tags: string;
    score: number;
    uses: number;
    successes: number;
    failures: number;
  }>;

  // Calculate similarities with context boost
  const matches: SolutionMatch[] = [];

  for (const row of rows) {
    let embedding: Float32Array;
    try {
      embedding = bufferToEmbedding(row.problem_embedding);
      if (embedding.length !== EMBEDDING_DIM) {
        continue; // Skip dimension mismatch
      }
    } catch {
      continue; // Skip corrupted embeddings
    }

    let similarity = cosineSimilarity(queryEmbedding, embedding);
    let contextBoost: 'same_repo' | 'similar_stack' | undefined;

    // Apply context boost
    if (row.repo_id === currentRepoId) {
      // Same repo: +15% boost
      similarity *= 1.15;
      contextBoost = 'same_repo';
    } else if (row.repo_id && currentRepoEmbedding) {
      // Check stack similarity
      const solutionRepoEmbedding = repoEmbeddings.get(row.repo_id);
      if (solutionRepoEmbedding) {
        const stackSimilarity = cosineSimilarity(currentRepoEmbedding, solutionRepoEmbedding);
        if (stackSimilarity > 0.7) {
          // Similar stack: +8% boost
          similarity *= 1.08;
          contextBoost = 'similar_stack';
        }
      }
    }

    // Cap boosted similarity to prevent >1.0 scores
    similarity = Math.min(0.95, similarity);

    if (similarity >= minScore) {
      const totalOutcomes = row.successes + row.failures;
      const successRate = totalOutcomes > 0 ? row.successes / totalOutcomes : 0.5;

      matches.push({
        id: row.id,
        problem: row.problem,
        solution: row.solution,
        scope: row.scope,
        tags: JSON.parse(row.tags || '[]'),
        similarity: Math.round(similarity * 1000) / 1000,
        score: row.score,
        uses: row.uses,
        successRate: Math.round(successRate * 100) / 100,
        contextBoost,
      });
    }
  }

  // Sort by similarity * score (combine semantic match with historical performance)
  matches.sort((a, b) => (b.similarity * b.score) - (a.similarity * a.score));

  const topMatches = matches.slice(0, limit);

  // Update usage count for returned solutions
  for (const match of topMatches) {
    db.query(`UPDATE solutions SET uses = uses + 1, last_used_at = datetime('now') WHERE id = ?`).run(match.id);
  }

  return {
    query: input.query,
    solutions: topMatches,
    totalFound: matches.length,
  };
}
