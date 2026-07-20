export interface CategoryWeightInput {
  categoryId: number;
  attempts: number;
  correct: number;
}

const LAPLACE_SMOOTHING = 1; // cold-start categories default to 0.5 accuracy, not 0 or 1
const MIN_WEIGHT = 0.05; // keeps categories the student has mastered from dropping out entirely

/**
 * Allocates `totalQuestions` across the given categories: every category gets at least
 * one question, and the remaining slots are weighted toward categories with lower
 * historical accuracy (Laplace-smoothed so unattempted categories start at a neutral
 * 0.5 rather than looking either perfect or hopeless).
 */
export function allocateQuestions(
  categoryStats: CategoryWeightInput[],
  totalQuestions = 30
): Map<number, number> {
  const n = categoryStats.length;
  if (n === 0) return new Map();
  if (n > totalQuestions) {
    throw new Error(
      `Cannot guarantee coverage: ${n} categories requested but only ${totalQuestions} questions available`
    );
  }

  const remaining = totalQuestions - n;

  const weighted = categoryStats.map((c) => {
    const accuracy = (c.correct + LAPLACE_SMOOTHING) / (c.attempts + 2 * LAPLACE_SMOOTHING);
    const weakness = 1 - accuracy;
    const weight = Math.max(weakness ** 2, MIN_WEIGHT);
    return { categoryId: c.categoryId, weakness, weight };
  });

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);

  const shares = weighted.map((w) => {
    const raw = remaining === 0 ? 0 : (w.weight / totalWeight) * remaining;
    return { categoryId: w.categoryId, weakness: w.weakness, raw, floor: Math.floor(raw) };
  });

  const allocatedFromFloors = shares.reduce((sum, s) => sum + s.floor, 0);
  const leftover = remaining - allocatedFromFloors;

  // Largest-remainder apportionment: deterministic tie-breaking by weakness, then id.
  const byRemainderDesc = [...shares].sort((a, b) => {
    const remainderDiff = b.raw - b.floor - (a.raw - a.floor);
    if (remainderDiff !== 0) return remainderDiff;
    const weaknessDiff = b.weakness - a.weakness;
    if (weaknessDiff !== 0) return weaknessDiff;
    return a.categoryId - b.categoryId;
  });
  const bonusCategoryIds = new Set(byRemainderDesc.slice(0, leftover).map((s) => s.categoryId));

  const allocation = new Map<number, number>();
  for (const s of shares) {
    allocation.set(s.categoryId, 1 + s.floor + (bonusCategoryIds.has(s.categoryId) ? 1 : 0));
  }
  return allocation;
}
