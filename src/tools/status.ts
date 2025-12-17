import { getDb } from '../db/index.js';

export interface StatusResult {
  status: string;
  database: string;
  stats: {
    solutions: number;
    failures: number;
    repos: number;
  };
  topTags: string[];
  recentSolutions: Array<{
    id: string;
    problem: string;
    scope: string;
    score: number;
    created_at: string;
  }>;
}

export function matrixStatus(): StatusResult {
  const db = getDb();

  const solutions = db.query('SELECT COUNT(*) as count FROM solutions').get() as { count: number };
  const failures = db.query('SELECT COUNT(*) as count FROM failures').get() as { count: number };
  const repos = db.query('SELECT COUNT(*) as count FROM repos').get() as { count: number };

  const topTags = db.query(`
    SELECT json_each.value as tag, COUNT(*) as count
    FROM solutions, json_each(solutions.tags)
    GROUP BY json_each.value
    ORDER BY count DESC
    LIMIT 10
  `).all() as Array<{ tag: string; count: number }>;

  const recentSolutions = db.query(`
    SELECT id, problem, scope, score, created_at
    FROM solutions
    ORDER BY created_at DESC
    LIMIT 5
  `).all() as StatusResult['recentSolutions'];

  return {
    status: 'operational',
    database: 'connected',
    stats: {
      solutions: solutions.count,
      failures: failures.count,
      repos: repos.count,
    },
    topTags: topTags.map(t => t.tag),
    recentSolutions,
  };
}
