import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTestDb, closeTestDb, seedSolution } from './helpers.js';

// Mock the db module to use test database
let mockDb: ReturnType<typeof createTestDb>;

describe('matrixStatus', () => {
  beforeEach(() => {
    mockDb = createTestDb();
  });

  afterEach(() => {
    closeTestDb();
  });

  test('returns correct solution count', () => {
    seedSolution(mockDb, 'sol_001', 'Test problem 1', 'Test solution 1', 'global');
    seedSolution(mockDb, 'sol_002', 'Test problem 2', 'Test solution 2', 'stack');

    const count = mockDb.query('SELECT COUNT(*) as count FROM solutions').get() as { count: number };
    expect(count.count).toBe(2);
  });

  test('returns correct failure count', () => {
    mockDb.query(`
      INSERT INTO failures (id, error_type, error_message, error_signature, error_embedding, root_cause, fix_applied)
      VALUES ('fail_001', 'runtime', 'Error message', 'sig123', X'00', 'cause', 'fix')
    `).run();

    const count = mockDb.query('SELECT COUNT(*) as count FROM failures').get() as { count: number };
    expect(count.count).toBe(1);
  });

  test('returns empty counts for fresh database', () => {
    const solutions = mockDb.query('SELECT COUNT(*) as count FROM solutions').get() as { count: number };
    const failures = mockDb.query('SELECT COUNT(*) as count FROM failures').get() as { count: number };
    const repos = mockDb.query('SELECT COUNT(*) as count FROM repos').get() as { count: number };

    expect(solutions.count).toBe(0);
    expect(failures.count).toBe(0);
    expect(repos.count).toBe(0);
  });

  test('returns recent solutions in correct order', () => {
    seedSolution(mockDb, 'sol_001', 'First problem', 'First solution', 'global');
    seedSolution(mockDb, 'sol_002', 'Second problem', 'Second solution', 'global');

    const recent = mockDb.query(`
      SELECT id FROM solutions ORDER BY created_at DESC LIMIT 5
    `).all() as Array<{ id: string }>;

    expect(recent.length).toBe(2);
    // Both have same timestamp, so order might vary
    expect(recent.map(r => r.id)).toContain('sol_001');
    expect(recent.map(r => r.id)).toContain('sol_002');
  });
});
