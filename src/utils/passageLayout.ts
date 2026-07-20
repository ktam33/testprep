import { Section } from '@/types';

export interface PassageSkeletonEntry {
  index: number;
  type: string;
  questionCount: number;
}

export type SectionLayout =
  | { kind: 'passages'; passages: PassageSkeletonEntry[] }
  | { kind: 'flat'; questionCount: number };

// Concrete passage/question breakdowns, each summing to 30. See plan doc for rationale.
export const SECTION_LAYOUTS: Record<Section, SectionLayout> = {
  english: {
    kind: 'passages',
    passages: [0, 1, 2, 3, 4].map((index) => ({ index, type: 'English Passage', questionCount: 6 })),
  },
  reading: {
    kind: 'passages',
    passages: [
      { index: 0, type: 'Literary Narrative', questionCount: 8 },
      { index: 1, type: 'Social Science', questionCount: 7 },
      { index: 2, type: 'Humanities', questionCount: 8 },
      { index: 3, type: 'Natural Science', questionCount: 7 },
    ],
  },
  science: {
    kind: 'passages',
    passages: [
      { index: 0, type: 'Conflicting Viewpoints', questionCount: 7 },
      { index: 1, type: 'Research Summary A', questionCount: 6 },
      { index: 2, type: 'Research Summary B', questionCount: 6 },
      { index: 3, type: 'Data Representation A', questionCount: 6 },
      { index: 4, type: 'Data Representation B', questionCount: 5 },
    ],
  },
  math: { kind: 'flat', questionCount: 30 },
};

const RESEARCH_SUMMARY_PASSAGES = ['Research Summary A', 'Research Summary B'];
const DATA_REPRESENTATION_PASSAGES = ['Data Representation A', 'Data Representation B'];

// Which Science passage types a category's questions may be placed in. Categories not
// listed (i.e. non-Science sections) are unconstrained. This is a placement *preference*
// fed into the generation prompt and the passage-assignment algorithm below — it is not
// hard-enforced after the model generates content (see plan §4).
export const SCIENCE_ELIGIBILITY_MAP: Record<string, string[]> = {
  Tables: DATA_REPRESENTATION_PASSAGES,
  Graphs: DATA_REPRESENTATION_PASSAGES,
  'Trends & Data Comparison': DATA_REPRESENTATION_PASSAGES,
  'Variables & Controls': RESEARCH_SUMMARY_PASSAGES,
  'Procedures & Experimental Design': RESEARCH_SUMMARY_PASSAGES,
  'Conclusions from Experiments': RESEARCH_SUMMARY_PASSAGES,
  Predictions: [...RESEARCH_SUMMARY_PASSAGES, ...DATA_REPRESENTATION_PASSAGES],
  'Evidence & Reasoning': [...RESEARCH_SUMMARY_PASSAGES, ...DATA_REPRESENTATION_PASSAGES],
  'Compare Scientific Claims': ['Conflicting Viewpoints'],
  'Agreements & Disagreements': ['Conflicting Viewpoints'],
  'Evaluating Evidence': ['Conflicting Viewpoints'],
};

export interface CategoryAllocation {
  categoryId: number;
  categoryName: string;
  count: number;
}

export interface CategoryToken {
  categoryId: number;
  categoryName: string;
}

export interface PassageAssignment {
  index: number;
  type: string;
  questionCount: number;
  categoryIds: number[];
  categoryNames: string[];
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function expandAndShuffle(allocations: CategoryAllocation[]): CategoryToken[] {
  const flat: CategoryToken[] = [];
  for (const a of allocations) {
    for (let i = 0; i < a.count; i++) flat.push({ categoryId: a.categoryId, categoryName: a.categoryName });
  }
  return shuffle(flat);
}

/** For Math: a shuffled, flat category-tag list (one entry per question, no passages). */
export function buildFlatQuestionList(allocations: CategoryAllocation[]): CategoryToken[] {
  return expandAndShuffle(allocations);
}

/**
 * Distributes category tokens across a passage skeleton. When an eligibility map is
 * given, more-constrained categories (fewer eligible passage types) are placed first so
 * they don't get crowded out by flexible categories that could have gone anywhere —
 * then any category that still can't find an eligible passage with room falls back to
 * any passage with remaining capacity, so every slot is always filled.
 */
export function assignCategoriesToPassages(
  allocations: CategoryAllocation[],
  passages: PassageSkeletonEntry[],
  eligibilityMap?: Record<string, string[]>
): PassageAssignment[] {
  const totalSlots = passages.reduce((sum, p) => sum + p.questionCount, 0);
  const totalAllocated = allocations.reduce((sum, a) => sum + a.count, 0);
  if (totalSlots !== totalAllocated) {
    throw new Error(
      `Passage skeleton has ${totalSlots} slots but ${totalAllocated} questions were allocated`
    );
  }

  const pool = expandAndShuffle(allocations);
  const eligibilityRank = (token: CategoryToken) =>
    eligibilityMap?.[token.categoryName]?.length ?? Number.MAX_SAFE_INTEGER;
  const orderedByConstraint = [...pool].sort((a, b) => eligibilityRank(a) - eligibilityRank(b));

  const remainingCapacity = new Map(passages.map((p) => [p.index, p.questionCount]));
  const assigned = new Map<number, CategoryToken[]>(passages.map((p) => [p.index, []]));
  const unplaced: CategoryToken[] = [];

  for (const token of orderedByConstraint) {
    const eligibleTypes = eligibilityMap?.[token.categoryName];
    if (eligibleTypes) {
      const candidates = passages.filter(
        (p) => eligibleTypes.includes(p.type) && (remainingCapacity.get(p.index) ?? 0) > 0
      );
      if (candidates.length > 0) {
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        assigned.get(target.index)!.push(token);
        remainingCapacity.set(target.index, remainingCapacity.get(target.index)! - 1);
        continue;
      }
    }
    unplaced.push(token);
  }

  for (const token of unplaced) {
    const candidates = passages.filter((p) => (remainingCapacity.get(p.index) ?? 0) > 0);
    if (candidates.length === 0) {
      throw new Error('No remaining passage capacity to place all questions — allocation/skeleton mismatch');
    }
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    assigned.get(target.index)!.push(token);
    remainingCapacity.set(target.index, remainingCapacity.get(target.index)! - 1);
  }

  return passages.map((p) => {
    const tokens = assigned.get(p.index)!;
    return {
      index: p.index,
      type: p.type,
      questionCount: p.questionCount,
      categoryIds: tokens.map((t) => t.categoryId),
      categoryNames: tokens.map((t) => t.categoryName),
    };
  });
}
