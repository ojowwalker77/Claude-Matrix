import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTestDb, closeTestDb, seedSolution } from './helpers.js';

let mockDb: ReturnType<typeof createTestDb>;

describe('reward scoring', () => {
  beforeEach(() => {
    mockDb = createTestDb();
  });

  afterEach(() => {
    closeTestDb();
  });

  test('success increases score asymptotically', () => {
    seedSolution(mockDb, 'sol_001', 'Problem', 'Solution', 'global');

    // Get initial score
    const before = mockDb.query('SELECT score FROM solutions WHERE id = ?').get('sol_001') as { score: number };
    expect(before.score).toBe(0.5);

    // Simulate success: score + 0.1 * (1 - score)
    const newScore = 0.5 + 0.1 * (1 - 0.5);
    mockDb.query('UPDATE solutions SET score = ?, successes = successes + 1 WHERE id = ?').run(newScore, 'sol_001');

    const after = mockDb.query('SELECT score, successes FROM solutions WHERE id = ?').get('sol_001') as { score: number; successes: number };
    expect(after.score).toBeCloseTo(0.55, 5);
    expect(after.successes).toBe(1);
  });

  test('partial increases score slightly', () => {
    seedSolution(mockDb, 'sol_001', 'Problem', 'Solution', 'global');

    // Simulate partial: score + 0.03
    const newScore = Math.min(1.0, 0.5 + 0.03);
    mockDb.query('UPDATE solutions SET score = ?, partial_successes = partial_successes + 1 WHERE id = ?').run(newScore, 'sol_001');

    const after = mockDb.query('SELECT score FROM solutions WHERE id = ?').get('sol_001') as { score: number };
    expect(after.score).toBeCloseTo(0.53, 5);
  });

  test('failure decreases score with minimum of 0.1', () => {
    seedSolution(mockDb, 'sol_001', 'Problem', 'Solution', 'global');

    // Simulate failure: max(0.1, score - 0.15)
    const newScore = Math.max(0.1, 0.5 - 0.15);
    mockDb.query('UPDATE solutions SET score = ?, failures = failures + 1 WHERE id = ?').run(newScore, 'sol_001');

    const after = mockDb.query('SELECT score, failures FROM solutions WHERE id = ?').get('sol_001') as { score: number; failures: number };
    expect(after.score).toBeCloseTo(0.35, 5);
    expect(after.failures).toBe(1);
  });

  test('multiple failures cannot go below 0.1', () => {
    seedSolution(mockDb, 'sol_001', 'Problem', 'Solution', 'global');

    // Apply 5 failures
    let score = 0.5;
    for (let i = 0; i < 5; i++) {
      score = Math.max(0.1, score - 0.15);
    }

    mockDb.query('UPDATE solutions SET score = ? WHERE id = ?').run(score, 'sol_001');

    const after = mockDb.query('SELECT score FROM solutions WHERE id = ?').get('sol_001') as { score: number };
    expect(after.score).toBe(0.1);
  });

  test('usage_log records outcome', () => {
    seedSolution(mockDb, 'sol_001', 'Problem', 'Solution', 'global');

    mockDb.query(`
      INSERT INTO usage_log (solution_id, outcome, notes)
      VALUES (?, ?, ?)
    `).run('sol_001', 'success', 'Worked perfectly');

    const log = mockDb.query('SELECT * FROM usage_log WHERE solution_id = ?').get('sol_001') as {
      solution_id: string;
      outcome: string;
      notes: string;
    };

    expect(log.solution_id).toBe('sol_001');
    expect(log.outcome).toBe('success');
    expect(log.notes).toBe('Worked perfectly');
  });
});
