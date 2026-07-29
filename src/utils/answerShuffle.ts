import { shuffle } from './random';

/**
 * Answer-position normalization. Generated tests skew hard toward slots A and B (in one
 * sample, 23 of 30 Science answers sat in A/B and only 1 in D), which is both gameable and
 * unlike a real form. Reordering at persist time fixes it for free, without another model
 * call.
 *
 * Three cases:
 * - `pinFirstChoice` — English underlined items, where slot 0 is "NO CHANGE" by
 *   construction and must stay put; only slots 1-3 move.
 * - All four choices are numeric — sorted ascending, matching ACT convention for numeric
 *   answers. Position is then determined by value, so no positional bias survives anyway.
 * - Everything else — full shuffle.
 */
export interface ReorderedChoices {
  choices: string[];
  correctAnswerIndex: number;
}

const LATEX_FRACTION = /^(-?)\\[dt]?frac\{(-?\d+(?:\.\d+)?)\}\{(-?\d+(?:\.\d+)?)\}$/;
const PLAIN_FRACTION = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/;
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

/**
 * Best-effort numeric value of an answer choice, or null if it isn't plainly numeric.
 * Deliberately conservative: an unrecognized choice falls through to shuffling, which is
 * always correct, just occasionally unconventional for a numeric item.
 */
export function parseNumericChoice(choice: string): number | null {
  let s = choice.trim();
  // Strip math delimiters: \( ... \), \[ ... \], $ ... $
  s = s
    .replace(/^\\\(/, '')
    .replace(/\\\)$/, '')
    .replace(/^\\\[/, '')
    .replace(/\\\]$/, '')
    .replace(/^\$/, '')
    .replace(/\$$/, '')
    .trim();
  // Strip currency/percent/thousands markers, which don't affect ordering within an item.
  s = s
    .replace(/^\\?\$/, '')
    .replace(/%$/, '')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .trim();

  const latex = s.match(LATEX_FRACTION);
  if (latex) {
    const denominator = Number(latex[3]);
    if (denominator === 0) return null;
    const value = Number(latex[2]) / denominator;
    return latex[1] === '-' ? -value : value;
  }

  const plain = s.match(PLAIN_FRACTION);
  if (plain) {
    const denominator = Number(plain[2]);
    if (denominator === 0) return null;
    return Number(plain[1]) / denominator;
  }

  return PLAIN_NUMBER.test(s) ? Number(s) : null;
}

/** New position ordering expressed as original indices. */
function buildOrder(choices: string[], pinFirstChoice: boolean): number[] {
  const indices = choices.map((_, i) => i);

  if (pinFirstChoice) {
    return [0, ...shuffle(indices.slice(1))];
  }

  const values = choices.map(parseNumericChoice);
  if (values.every((v) => v !== null)) {
    const numeric = values as number[];
    // Ties would make ordering arbitrary and signal a malformed item; leave those alone.
    const distinct = new Set(numeric).size === numeric.length;
    if (distinct) return [...indices].sort((a, b) => numeric[a] - numeric[b]);
  }

  return shuffle(indices);
}

/**
 * Reorders answer choices and remaps `correctAnswerIndex` to follow the correct answer.
 * Returns the input untouched when it is too short or the index is out of range.
 */
export function reorderChoices(
  choices: string[],
  correctAnswerIndex: number,
  { pinFirstChoice = false }: { pinFirstChoice?: boolean } = {}
): ReorderedChoices {
  if (choices.length < 2) return { choices, correctAnswerIndex };
  if (!Number.isInteger(correctAnswerIndex) || correctAnswerIndex < 0 || correctAnswerIndex >= choices.length) {
    return { choices, correctAnswerIndex };
  }

  const order = buildOrder(choices, pinFirstChoice);
  return {
    choices: order.map((i) => choices[i]),
    correctAnswerIndex: order.indexOf(correctAnswerIndex),
  };
}
