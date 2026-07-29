import { describe, expect, it } from 'vitest';
import { parseNumericChoice, reorderChoices } from './answerShuffle';

describe('parseNumericChoice', () => {
  it.each([
    ['7', 7],
    ['-3', -3],
    ['2.5', 2.5],
    ['\\(12\\)', 12],
    ['\\(-4.5\\)', -4.5],
    ['\\(\\dfrac{11}{12}\\)', 11 / 12],
    ['\\(\\frac{3}{4}\\)', 0.75],
    ['\\(-\\dfrac{1}{2}\\)', -0.5],
    ['3/8', 0.375],
    ['$1,250', 1250],
    ['45%', 45],
  ])('parses %s', (input, expected) => {
    expect(parseNumericChoice(input)).toBeCloseTo(expected, 10);
  });

  it.each(['\\(x + 3\\)', 'NO CHANGE', 'The bees pollinate the crop.', '\\(\\dfrac{1}{0}\\)', ''])(
    'returns null for %s',
    (input) => {
      expect(parseNumericChoice(input)).toBeNull();
    }
  );
});

describe('reorderChoices', () => {
  it('keeps the correct answer pointing at the same text', () => {
    const choices = ['alpha', 'beta', 'gamma', 'delta'];
    for (let run = 0; run < 500; run++) {
      for (let correct = 0; correct < 4; correct++) {
        const result = reorderChoices(choices, correct);
        expect(result.choices[result.correctAnswerIndex]).toBe(choices[correct]);
        expect([...result.choices].sort()).toEqual([...choices].sort());
      }
    }
  });

  it('spreads correct answers across all four slots', () => {
    const counts = [0, 0, 0, 0];
    for (let run = 0; run < 2000; run++) {
      counts[reorderChoices(['a', 'b', 'c', 'd'], 0).correctAnswerIndex]++;
    }
    // Uniform would be 500 each; a wide band still catches a stuck or biased permutation.
    for (const count of counts) expect(count).toBeGreaterThan(300);
  });

  it('sorts numeric choices ascending rather than shuffling', () => {
    const result = reorderChoices(['\\(9\\)', '\\(2\\)', '\\(15\\)', '\\(7\\)'], 2);
    expect(result.choices).toEqual(['\\(2\\)', '\\(7\\)', '\\(9\\)', '\\(15\\)']);
    expect(result.choices[result.correctAnswerIndex]).toBe('\\(15\\)');
  });

  it('sorts LaTeX fractions by value', () => {
    const result = reorderChoices(
      ['\\(\\dfrac{3}{4}\\)', '\\(\\dfrac{1}{8}\\)', '\\(\\dfrac{1}{2}\\)', '\\(\\dfrac{5}{8}\\)'],
      0
    );
    expect(result.choices).toEqual([
      '\\(\\dfrac{1}{8}\\)',
      '\\(\\dfrac{1}{2}\\)',
      '\\(\\dfrac{5}{8}\\)',
      '\\(\\dfrac{3}{4}\\)',
    ]);
    expect(result.correctAnswerIndex).toBe(3);
  });

  it('shuffles when the choices are not all numeric', () => {
    const choices = ['\\(2\\)', '\\(x + 1\\)', '\\(7\\)', '\\(9\\)'];
    const seen = new Set<string>();
    for (let run = 0; run < 200; run++) {
      seen.add(reorderChoices(choices, 1).choices.join('|'));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('leaves duplicate numeric values alone rather than sorting arbitrarily', () => {
    const choices = ['5', '5', '2', '9'];
    const result = reorderChoices(choices, 3);
    expect(result.choices[result.correctAnswerIndex]).toBe('9');
  });

  it('pins slot 0 and shuffles the rest when pinFirstChoice is set', () => {
    const choices = ['NO CHANGE', 'bees, which', 'bees which', 'bees; which'];
    for (let run = 0; run < 300; run++) {
      const result = reorderChoices(choices, 2, { pinFirstChoice: true });
      expect(result.choices[0]).toBe('NO CHANGE');
      expect(result.correctAnswerIndex).not.toBe(0);
      expect(result.choices[result.correctAnswerIndex]).toBe('bees which');
    }
  });

  it('keeps a pinned correct answer in slot 0', () => {
    const result = reorderChoices(['NO CHANGE', 'a', 'b', 'c'], 0, { pinFirstChoice: true });
    expect(result.correctAnswerIndex).toBe(0);
  });

  it.each([
    [['only'], 0],
    [['a', 'b', 'c', 'd'], 4],
    [['a', 'b', 'c', 'd'], -1],
  ])('returns malformed input untouched', (choices, correct) => {
    const result = reorderChoices(choices, correct);
    expect(result.choices).toEqual(choices);
    expect(result.correctAnswerIndex).toBe(correct);
  });
});
