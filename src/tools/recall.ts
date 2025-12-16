import { getDb, bufferToEmbedding, cosineSimilarity } from '../db/client.js';
import { getEmbedding } from '../embeddings/local.js';

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

  // Generate embedding for query
  const queryEmbedding = await getEmbedding(input.query);

  // Get all solutions with embeddings
  let query = `
    SELECT id, problem, problem_embedding, solution, scope, tags, score, uses, successes, failures
    FROM solutions
    WHERE problem_embedding IS NOT NULL
  `;

  if (input.scopeFilter && input.scopeFilter !== 'all') {
    query += ` AND scope = '${input.scopeFilter}'`;
  }

  const rows = db.query(query).all() as Array<{
    id: string;
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

  // Calculate similarities
  const matches: SolutionMatch[] = [];

  for (const row of rows) {
    const embedding = bufferToEmbedding(row.problem_embedding);
    const similarity = cosineSimilarity(queryEmbedding, embedding);

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
