import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { clearJobTimeout, clearAllJobTimeouts, _jobTimeoutsForTesting } from '../jobs/workers.js';

describe('timeout tracking', () => {
  beforeEach(() => {
    // Clear map before each test
    _jobTimeoutsForTesting.clear();
  });

  afterEach(() => {
    // Cleanup any remaining timeouts
    for (const [, timeout] of _jobTimeoutsForTesting) {
      clearTimeout(timeout);
    }
    _jobTimeoutsForTesting.clear();
  });

  test('clearJobTimeout removes timeout from map and returns true', () => {
    const jobId = 'test_job_001';
    const timeout = setTimeout(() => {}, 10000);
    _jobTimeoutsForTesting.set(jobId, timeout);

    expect(_jobTimeoutsForTesting.has(jobId)).toBe(true);

    const result = clearJobTimeout(jobId);

    expect(result).toBe(true);
    expect(_jobTimeoutsForTesting.has(jobId)).toBe(false);
  });

  test('clearJobTimeout returns false for unknown jobId', () => {
    const result = clearJobTimeout('nonexistent_job');

    expect(result).toBe(false);
  });

  test('clearJobTimeout clears the actual timeout', () => {
    const jobId = 'test_job_002';
    let timeoutFired = false;

    const timeout = setTimeout(() => {
      timeoutFired = true;
    }, 50);
    _jobTimeoutsForTesting.set(jobId, timeout);

    clearJobTimeout(jobId);

    // Wait longer than the timeout would have fired
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(timeoutFired).toBe(false);
        resolve();
      }, 100);
    });
  });

  test('clearAllJobTimeouts clears all timeouts and returns count', () => {
    // Add multiple timeouts
    for (let i = 0; i < 5; i++) {
      const timeout = setTimeout(() => {}, 10000);
      _jobTimeoutsForTesting.set(`job_${i}`, timeout);
    }

    expect(_jobTimeoutsForTesting.size).toBe(5);

    const cleared = clearAllJobTimeouts();

    expect(cleared).toBe(5);
    expect(_jobTimeoutsForTesting.size).toBe(0);
  });

  test('clearAllJobTimeouts returns 0 when no timeouts exist', () => {
    const cleared = clearAllJobTimeouts();

    expect(cleared).toBe(0);
  });

  test('clearAllJobTimeouts prevents all callbacks from firing', () => {
    const firedCallbacks: string[] = [];

    // Add multiple timeouts
    for (let i = 0; i < 3; i++) {
      const jobId = `job_${i}`;
      const timeout = setTimeout(() => {
        firedCallbacks.push(jobId);
      }, 50);
      _jobTimeoutsForTesting.set(jobId, timeout);
    }

    clearAllJobTimeouts();

    // Wait longer than any timeout would have fired
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(firedCallbacks.length).toBe(0);
        resolve();
      }, 150);
    });
  });
});
