import { describe, test, expect } from 'bun:test';
import { cosineSimilarity } from '../embeddings/index.js';

describe('cosineSimilarity', () => {
  test('returns 1.0 for identical normalized vectors', () => {
    const a = new Float32Array([0.6, 0.8, 0]);
    const b = new Float32Array([0.6, 0.8, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  test('returns 0.0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  test('returns -1.0 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  test('returns correct similarity for arbitrary vectors', () => {
    // 45 degree angle = cos(45) ≈ 0.707
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 1]);
    const normalized = 1 / Math.sqrt(2);
    // oxlint-disable-next-line oxc/erasing-op -- intentional: shows dot product formula a·b = a1*b1 + a2*b2
    const expected = 1 * normalized + 0 * normalized; // ≈ 0.707
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 3);
  });

  test('throws on dimension mismatch', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([1, 0]);
    expect(() => cosineSimilarity(a, b)).toThrow('Dimension mismatch');
  });

  test('returns 0 for zero vectors', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  test('handles high-dimensional vectors', () => {
    const dim = 384;
    const a = new Float32Array(dim).fill(1 / Math.sqrt(dim));
    const b = new Float32Array(dim).fill(1 / Math.sqrt(dim));
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 3);
  });
});
