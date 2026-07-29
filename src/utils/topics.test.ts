import { describe, expect, it } from 'vitest';
import { planMathTopics, planPassageTopics } from './topics';
import { SECTION_LAYOUTS } from './passageLayout';

function typesFor(section: 'english' | 'reading' | 'science'): string[] {
  const layout = SECTION_LAYOUTS[section];
  if (layout.kind !== 'passages') throw new Error('expected a passage layout');
  return layout.passages.map((p) => p.type);
}

const PASSAGE_SECTIONS = ['english', 'reading', 'science'] as const;

describe('planPassageTopics', () => {
  it.each(PASSAGE_SECTIONS)('returns one non-empty seed per passage for %s', (section) => {
    const types = typesFor(section);
    const seeds = planPassageTopics(section, types);

    expect(seeds).toHaveLength(types.length);
    for (const seed of seeds) {
      expect(seed.labels.length).toBeGreaterThan(0);
      expect(seed.instruction.trim()).not.toBe('');
    }
  });

  it.each(PASSAGE_SECTIONS)('never repeats a subject within one %s test', (section) => {
    const types = typesFor(section);
    // Repeat: the draw is random, so a single pass could get lucky.
    for (let run = 0; run < 200; run++) {
      const labels = planPassageTopics(section, types).flatMap((s) => s.labels);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it.each(PASSAGE_SECTIONS)('avoids recent labels for %s when the pool allows', (section) => {
    const types = typesFor(section);
    const recent = planPassageTopics(section, types).flatMap((s) => s.labels);

    for (let run = 0; run < 200; run++) {
      const next = planPassageTopics(section, types, recent).flatMap((s) => s.labels);
      expect(next.filter((l) => recent.includes(l))).toEqual([]);
    }
  });

  it('still fills every slot when the whole pool is in the avoid-list', () => {
    const types = typesFor('science');
    // Ten tests' worth of history is far more than the science discipline pool holds.
    const exhausted = Array.from({ length: 10 }, () => planPassageTopics('science', types)).flatMap((seeds) =>
      seeds.flatMap((s) => s.labels)
    );

    const seeds = planPassageTopics('science', types, exhausted);
    const labels = seeds.flatMap((s) => s.labels);
    expect(labels).toHaveLength(types.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('embeds the drawn subject in the instruction text', () => {
    const seeds = planPassageTopics('english', typesFor('english'));
    for (const seed of seeds) {
      expect(seed.instruction).toContain(seed.labels[0]);
    }
  });

  it('varies the rhetorical mode across English passages', () => {
    const seeds = planPassageTopics('english', typesFor('english'));
    // Modes are drawn without replacement, so five passages yield five distinct openings.
    const modes = seeds.map((s) => s.instruction.split(', on the subject of')[0]);
    expect(new Set(modes).size).toBe(seeds.length);
  });

  it('shapes the Science instruction to the passage type', () => {
    const seeds = planPassageTopics('science', typesFor('science'));
    expect(seeds[0].instruction).toContain('disagree');
    expect(seeds[1].instruction).toContain('experiments');
    expect(seeds[3].instruction).toContain('data set');
  });

  it('returns math seeds with several distinct contexts', () => {
    const seed = planMathTopics();
    expect(seed.labels.length).toBeGreaterThanOrEqual(5);
    expect(new Set(seed.labels).size).toBe(seed.labels.length);
    for (const label of seed.labels) expect(seed.instruction).toContain(label);
  });

  it('avoids recent math contexts', () => {
    const recent = planMathTopics().labels;
    const next = planMathTopics(recent);
    expect(next.labels.filter((l) => recent.includes(l))).toEqual([]);
  });
});
