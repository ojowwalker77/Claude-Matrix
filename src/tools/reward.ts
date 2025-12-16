import { getDb } from '../db/client.js';

interface RewardInput {
  solutionId: string;
  outcome: 'success' | 'partial' | 'failure';
  notes?: string;
}

interface RewardResult {
  solutionId: string;
  outcome: string;
  previousScore: number;
  newScore: number;
  message: string;
}

export async function matrixReward(input: RewardInput): Promise<RewardResult> {
  const db = getDb();

  // Get current solution
  const solution = db.query(`
    SELECT id, score, successes, partial_successes, failures
    FROM solutions WHERE id = ?
  `).get(input.solutionId) as {
    id: string;
    score: number;
    successes: number;
    partial_successes: number;
    failures: number;
  } | null;

  if (!solution) {
    throw new Error(`Solution not found: ${input.solutionId}`);
  }

  const previousScore = solution.score;
  let newScore = previousScore;

  // Adjust score based on outcome
  switch (input.outcome) {
    case 'success':
      // Asymptotic approach to 1.0
      newScore = previousScore + 0.1 * (1 - previousScore);
      db.query(`
        UPDATE solutions
        SET score = ?, successes = successes + 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(newScore, input.solutionId);
      break;

    case 'partial':
      newScore = Math.min(1.0, previousScore + 0.03);
      db.query(`
        UPDATE solutions
        SET score = ?, partial_successes = partial_successes + 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(newScore, input.solutionId);
      break;

    case 'failure':
      newScore = Math.max(0.1, previousScore - 0.15);
      db.query(`
        UPDATE solutions
        SET score = ?, failures = failures + 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(newScore, input.solutionId);
      break;
  }

  // Log usage
  db.query(`
    INSERT INTO usage_log (solution_id, outcome, notes)
    VALUES (?, ?, ?)
  `).run(input.solutionId, input.outcome, input.notes || null);

  newScore = Math.round(newScore * 1000) / 1000;

  return {
    solutionId: input.solutionId,
    outcome: input.outcome,
    previousScore: Math.round(previousScore * 1000) / 1000,
    newScore,
    message: `Score updated: ${previousScore.toFixed(2)} → ${newScore.toFixed(2)}`,
  };
}
