import { getDb, bufferToEmbedding, cosineSimilarity } from '../db/client.js';
import { getEmbedding, EMBEDDING_DIM } from '../embeddings/local.js';
import { fingerprintRepo, getOrCreateRepo, getRepoEmbedding, getAllReposWithEmbeddings } from '../repo/index.js';
import type { SolutionCategory, CodeBlock } from '../types/db.js';

interface RecallInput {
  query: string;
  limit?: number;
  minScore?: number;
  scopeFilter?: 'all' | 'repo' | 'stack' | 'global';
  categoryFilter?: SolutionCategory;
  maxComplexity?: number;
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
  category?: SolutionCategory;
  complexity?: number;
  prerequisites?: string[];
  antiPatterns?: string[];
  codeBlocks?: CodeBlock[];
  relatedSolutions?: string[];
  supersededBy?: string;
}

interface RecallResult {
  query: string;
  solutions: SolutionMatch[];
  totalFound: number;
}

/**
 * Get full solution details by ID
 * Used when compact recall returns a match and full details are needed
 */
export function matrixGetSolution(solutionId: string): SolutionMatch | null {
  const db = getDb();

  const row = db.query(`
    SELECT id, repo_id, problem, solution, scope, tags, score, uses, successes, failures,
           category, complexity, prerequisites, anti_patterns, code_blocks, related_solutions
    FROM solutions WHERE id = ?
  `).get(solutionId) as {
    id: string; repo_id: string | null; problem: string;
    solution: string; scope: string; tags: string; score: number; uses: number;
    successes: number; failures: number; category: string | null; complexity: number | null;
    prerequisites: string | null; anti_patterns: string | null; code_blocks: string | null;
    related_solutions: string | null;
  } | null;

  if (!row) return null;

  // Check if superseded
  const supersededRow = db.query(`SELECT id FROM solutions WHERE supersedes = ?`).get(solutionId) as { id: string } | null;

  const totalOutcomes = row.successes + row.failures;
  const successRate = totalOutcomes > 0 ? row.successes / totalOutcomes : 0.5;

  const match: SolutionMatch = {
    id: row.id, problem: row.problem, solution: row.solution, scope: row.scope,
    tags: JSON.parse(row.tags || '[]'),
    similarity: 1, // Not from search
    score: row.score, uses: row.uses,
    successRate: Math.round(successRate * 100) / 100,
  };

  if (row.category) match.category = row.category as SolutionCategory;
  if (row.complexity !== null) match.complexity = row.complexity;
  if (row.prerequisites) { const p = JSON.parse(row.prerequisites); if (p.length) match.prerequisites = p; }
  if (row.anti_patterns) { const a = JSON.parse(row.anti_patterns); if (a.length) match.antiPatterns = a; }
  if (row.code_blocks) { const c = JSON.parse(row.code_blocks); if (c.length) match.codeBlocks = c; }
  if (row.related_solutions) { const r = JSON.parse(row.related_solutions); if (r.length) match.relatedSolutions = r; }
  if (supersededRow) match.supersededBy = supersededRow.id;

  return match;
}

export async function matrixRecall(input: RecallInput): Promise<RecallResult> {
  const db = getDb();
  const limit = input.limit ?? 5;
  const minScore = input.minScore ?? 0.3;

  const detected = fingerprintRepo();
  const currentRepoId = await getOrCreateRepo(detected);
  const currentRepoEmbedding = getRepoEmbedding(currentRepoId);

  const repoEmbeddings = new Map<string, Float32Array>();
  for (const { id, embedding } of getAllReposWithEmbeddings()) {
    repoEmbeddings.set(id, embedding);
  }

  const queryEmbedding = await getEmbedding(input.query);

  // Build superseded lookup (small table scan - most solutions don't supersede others)
  const supersededByMap = new Map<string, string>();
  const supersededRows = db.query(`SELECT supersedes, id FROM solutions WHERE supersedes IS NOT NULL`).all() as Array<{ supersedes: string; id: string }>;
  for (const row of supersededRows) {
    supersededByMap.set(row.supersedes, row.id);
  }

  const params: (string | number)[] = [];
  let query = `
    SELECT id, repo_id, problem, problem_embedding, solution, scope, tags, score, uses, successes, failures,
           category, complexity, prerequisites, anti_patterns, code_blocks, related_solutions
    FROM solutions WHERE problem_embedding IS NOT NULL
  `;

  if (input.scopeFilter && input.scopeFilter !== 'all') {
    query += ` AND scope = ?`;
    params.push(input.scopeFilter);
  }
  if (input.categoryFilter) {
    query += ` AND category = ?`;
    params.push(input.categoryFilter);
  }
  if (input.maxComplexity) {
    query += ` AND complexity IS NOT NULL AND complexity <= ?`;
    params.push(input.maxComplexity);
  }

  const rows = db.query(query).all(...params) as Array<{
    id: string; repo_id: string | null; problem: string; problem_embedding: Uint8Array;
    solution: string; scope: string; tags: string; score: number; uses: number;
    successes: number; failures: number; category: string | null; complexity: number | null;
    prerequisites: string | null; anti_patterns: string | null; code_blocks: string | null;
    related_solutions: string | null;
  }>;

  const matches: SolutionMatch[] = [];

  for (const row of rows) {
    let embedding: Float32Array;
    try {
      embedding = bufferToEmbedding(row.problem_embedding);
      if (embedding.length !== EMBEDDING_DIM) continue;
    } catch { continue; }

    let similarity = cosineSimilarity(queryEmbedding, embedding);
    let contextBoost: 'same_repo' | 'similar_stack' | undefined;

    if (row.repo_id === currentRepoId) {
      similarity *= 1.15;
      contextBoost = 'same_repo';
    } else if (row.repo_id && currentRepoEmbedding) {
      const solutionRepoEmbedding = repoEmbeddings.get(row.repo_id);
      if (solutionRepoEmbedding && cosineSimilarity(currentRepoEmbedding, solutionRepoEmbedding) > 0.7) {
        similarity *= 1.08;
        contextBoost = 'similar_stack';
      }
    }

    similarity = Math.min(0.99, similarity);

    if (similarity >= minScore) {
      const totalOutcomes = row.successes + row.failures;
      const successRate = totalOutcomes > 0 ? row.successes / totalOutcomes : 0.5;

      const match: SolutionMatch = {
        id: row.id, problem: row.problem, solution: row.solution, scope: row.scope,
        tags: JSON.parse(row.tags || '[]'),
        similarity: Math.round(similarity * 1000) / 1000,
        score: row.score, uses: row.uses,
        successRate: Math.round(successRate * 100) / 100,
        contextBoost,
      };

      if (row.category) match.category = row.category as SolutionCategory;
      if (row.complexity !== null) match.complexity = row.complexity;
      if (row.prerequisites) { const p = JSON.parse(row.prerequisites); if (p.length) match.prerequisites = p; }
      if (row.anti_patterns) { const a = JSON.parse(row.anti_patterns); if (a.length) match.antiPatterns = a; }
      if (row.code_blocks) { const c = JSON.parse(row.code_blocks); if (c.length) match.codeBlocks = c; }
      if (row.related_solutions) { const r = JSON.parse(row.related_solutions); if (r.length) match.relatedSolutions = r; }
      const supersededBy = supersededByMap.get(row.id);
      if (supersededBy) match.supersededBy = supersededBy;

      matches.push(match);
    }
  }

  matches.sort((a, b) => (b.similarity * b.score) - (a.similarity * a.score));
  const topMatches = matches.slice(0, limit);

  for (const match of topMatches) {
    db.query(`UPDATE solutions SET uses = uses + 1, last_used_at = datetime('now') WHERE id = ?`).run(match.id);
  }

  return { query: input.query, solutions: topMatches, totalFound: matches.length };
}
