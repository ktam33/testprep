import { describe, expect, it } from 'vitest';
import {
  assignCategoriesToPassages,
  buildFlatQuestionList,
  CategoryAllocation,
  SCIENCE_ELIGIBILITY_MAP,
  SECTION_LAYOUTS,
} from './passageLayout';

function tally(names: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of names) map.set(n, (map.get(n) ?? 0) + 1);
  return map;
}

describe('SECTION_LAYOUTS', () => {
  it.each(['english', 'reading', 'science'] as const)('sums to 30 questions for %s', (section) => {
    const layout = SECTION_LAYOUTS[section];
    if (layout.kind !== 'passages') throw new Error('expected passages layout');
    const total = layout.passages.reduce((sum, p) => sum + p.questionCount, 0);
    expect(total).toBe(30);
  });

  it('math is a flat 30-question layout with no passages', () => {
    expect(SECTION_LAYOUTS.math).toEqual({ kind: 'flat', questionCount: 30 });
  });
});

describe('buildFlatQuestionList', () => {
  it('produces exactly the requested count per category, shuffled', () => {
    const allocations: CategoryAllocation[] = [
      { categoryId: 1, categoryName: 'A', count: 5 },
      { categoryId: 2, categoryName: 'B', count: 3 },
    ];
    const list = buildFlatQuestionList(allocations);
    expect(list).toHaveLength(8);
    const counts = tally(list.map((t) => t.categoryName));
    expect(counts.get('A')).toBe(5);
    expect(counts.get('B')).toBe(3);
  });
});

describe('assignCategoriesToPassages', () => {
  const englishLayoutRaw = SECTION_LAYOUTS.english;
  if (englishLayoutRaw.kind !== 'passages') throw new Error('expected passages layout');
  const englishPassages = englishLayoutRaw.passages;

  it('places every category instance exactly once and matches per-passage question counts', () => {
    const allocations: CategoryAllocation[] = [
      { categoryId: 1, categoryName: 'A', count: 10 },
      { categoryId: 2, categoryName: 'B', count: 10 },
      { categoryId: 3, categoryName: 'C', count: 10 },
    ];
    const result = assignCategoriesToPassages(allocations, englishPassages);

    for (const passage of result) {
      expect(passage.categoryIds).toHaveLength(passage.questionCount);
      expect(passage.categoryNames).toHaveLength(passage.questionCount);
    }

    const allNames = result.flatMap((p) => p.categoryNames);
    expect(allNames).toHaveLength(30);
    const counts = tally(allNames);
    expect(counts.get('A')).toBe(10);
    expect(counts.get('B')).toBe(10);
    expect(counts.get('C')).toBe(10);
  });

  it('throws when allocation total does not match skeleton total', () => {
    const allocations: CategoryAllocation[] = [{ categoryId: 1, categoryName: 'A', count: 29 }];
    expect(() => assignCategoriesToPassages(allocations, englishPassages)).toThrow();
  });

  const scienceLayoutRaw = SECTION_LAYOUTS.science;
  if (scienceLayoutRaw.kind !== 'passages') throw new Error('expected passages layout');
  const sciencePassages = scienceLayoutRaw.passages;

  it('respects the Science eligibility map when demand exactly fits eligible capacity', () => {

    // CV: 7 (== CV passage capacity). DI: 9 (<= 11 DR capacity). ED: 9 (<= 12 RS capacity).
    // SR: 5, exactly the leftover RS+DR capacity (3 + 2) once DI/ED are placed.
    const allocations: CategoryAllocation[] = [
      { categoryId: 1, categoryName: 'Compare Scientific Claims', count: 3 },
      { categoryId: 2, categoryName: 'Agreements & Disagreements', count: 2 },
      { categoryId: 3, categoryName: 'Evaluating Evidence', count: 2 },
      { categoryId: 4, categoryName: 'Tables', count: 3 },
      { categoryId: 5, categoryName: 'Graphs', count: 3 },
      { categoryId: 6, categoryName: 'Trends & Data Comparison', count: 3 },
      { categoryId: 7, categoryName: 'Variables & Controls', count: 3 },
      { categoryId: 8, categoryName: 'Procedures & Experimental Design', count: 3 },
      { categoryId: 9, categoryName: 'Conclusions from Experiments', count: 3 },
      { categoryId: 10, categoryName: 'Predictions', count: 3 },
      { categoryId: 11, categoryName: 'Evidence & Reasoning', count: 2 },
    ];
    expect(allocations.reduce((sum, a) => sum + a.count, 0)).toBe(30);

    const result = assignCategoriesToPassages(allocations, sciencePassages, SCIENCE_ELIGIBILITY_MAP);

    for (const passage of result) {
      for (const categoryName of passage.categoryNames) {
        const eligibleTypes = SCIENCE_ELIGIBILITY_MAP[categoryName];
        expect(eligibleTypes).toContain(passage.type);
      }
    }
  });

  it('still places every question even when a category exceeds its eligible passage capacity', () => {
    // Conflicting Viewpoints passage only has 7 slots; demand 10 for one CV-only category.
    const allocations: CategoryAllocation[] = [
      { categoryId: 1, categoryName: 'Compare Scientific Claims', count: 10 },
      { categoryId: 2, categoryName: 'Unconstrained Filler', count: 20 },
    ];
    const result = assignCategoriesToPassages(allocations, sciencePassages, SCIENCE_ELIGIBILITY_MAP);

    const allNames = result.flatMap((p) => p.categoryNames);
    expect(tally(allNames).get('Compare Scientific Claims')).toBe(10); // none dropped

    const cvPassage = result.find((p) => p.type === 'Conflicting Viewpoints')!;
    const cvCount = cvPassage.categoryNames.filter((n) => n === 'Compare Scientific Claims').length;
    expect(cvCount).toBeLessThanOrEqual(cvPassage.questionCount); // capacity never exceeded
    expect(cvCount).toBeLessThan(10); // some had to spill outside the eligible passage
  });
});
