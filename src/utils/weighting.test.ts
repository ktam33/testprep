import { describe, expect, it } from 'vitest';
import { allocateQuestions, CategoryWeightInput } from './weighting';

function coldStart(n: number): CategoryWeightInput[] {
  return Array.from({ length: n }, (_, i) => ({ categoryId: i + 1, attempts: 0, correct: 0 }));
}

function sumOf(allocation: Map<number, number>): number {
  return [...allocation.values()].reduce((sum, v) => sum + v, 0);
}

describe('allocateQuestions', () => {
  it.each([11, 12, 16, 18])('sums to totalQuestions for N=%i cold-start categories', (n) => {
    const allocation = allocateQuestions(coldStart(n), 30);
    expect(sumOf(allocation)).toBe(30);
  });

  it.each([11, 12, 16, 18])('gives every category at least 1 question for N=%i', (n) => {
    const allocation = allocateQuestions(coldStart(n), 30);
    expect(allocation.size).toBe(n);
    for (const count of allocation.values()) {
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives a near-even split on a student\'s very first test (all cold-start)', () => {
    const allocation = allocateQuestions(coldStart(16), 30);
    const counts = [...allocation.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('gives a proven-weak category strictly more slots than a proven-strong one', () => {
    const stats: CategoryWeightInput[] = [
      { categoryId: 1, attempts: 20, correct: 2 }, // 10% accuracy -> weak
      { categoryId: 2, attempts: 20, correct: 19 }, // 95% accuracy -> strong
      ...coldStart(9).map((c) => ({ ...c, categoryId: c.categoryId + 2 })),
    ];
    const allocation = allocateQuestions(stats, 30);
    expect(allocation.get(1)!).toBeGreaterThan(allocation.get(2)!);
  });

  it('ranks an unattempted category between a proven-weak and a proven-strong one', () => {
    const stats: CategoryWeightInput[] = [
      { categoryId: 1, attempts: 20, correct: 2 }, // weak
      { categoryId: 2, attempts: 0, correct: 0 }, // cold start (~0.5 prior)
      { categoryId: 3, attempts: 20, correct: 19 }, // strong
      ...coldStart(8).map((c) => ({ ...c, categoryId: c.categoryId + 3 })),
    ];
    const allocation = allocateQuestions(stats, 30);
    expect(allocation.get(1)!).toBeGreaterThan(allocation.get(2)!);
    expect(allocation.get(2)!).toBeGreaterThan(allocation.get(3)!);
  });

  it('is deterministic for identical input', () => {
    const stats: CategoryWeightInput[] = [
      { categoryId: 1, attempts: 5, correct: 1 },
      { categoryId: 2, attempts: 5, correct: 4 },
      { categoryId: 3, attempts: 0, correct: 0 },
    ];
    const a = allocateQuestions(stats, 10);
    const b = allocateQuestions(stats, 10);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it('throws if there are more categories than total questions', () => {
    expect(() => allocateQuestions(coldStart(31), 30)).toThrow();
  });

  it('handles the edge case where categories exactly equal totalQuestions', () => {
    const allocation = allocateQuestions(coldStart(30), 30);
    expect(sumOf(allocation)).toBe(30);
    for (const count of allocation.values()) expect(count).toBe(1);
  });
});
