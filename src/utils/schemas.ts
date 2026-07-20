import { z } from 'zod';

function toNonEmptyTuple(values: string[]): [string, ...string[]] {
  if (values.length === 0) throw new Error('Expected at least one category name');
  return values as [string, ...string[]];
}

// Every field is always present (empty string/array when unused for a given `kind`)
// rather than optional — OpenAI Structured Outputs strict mode requires every object
// property to be listed as required, so a flat always-fully-populated shape is the
// lowest-risk choice over a discriminated union.
export function buildFigureSchema() {
  return z.object({
    kind: z.enum(['none', 'table', 'bar', 'line', 'scatter']),
    title: z.string(),
    xLabel: z.string(),
    yLabel: z.string(),
    columns: z.array(z.string()), // only meaningful when kind === 'table'
    rows: z.array(z.array(z.string())), // only meaningful when kind === 'table'
    series: z.array(
      z.object({
        label: z.string(),
        points: z.array(z.object({ x: z.number(), y: z.number() })),
      })
    ), // only meaningful when kind is a chart type
  });
}

export function buildQuestionSchema(categoryNames: string[], includeFigure: boolean) {
  const base = {
    index: z.number().int(),
    category: z.enum(toNonEmptyTuple(categoryNames)),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    prompt: z.string(),
    choices: z.array(z.string()).length(4),
    correctAnswerIndex: z.number().int().min(0).max(3),
    explanation: z.string(),
  };
  return includeFigure ? z.object({ ...base, figure: buildFigureSchema() }) : z.object(base);
}

export function buildPassageTestSchema(
  categoryNames: string[],
  { passagesHaveFigure }: { passagesHaveFigure: boolean }
) {
  const questionSchema = buildQuestionSchema(categoryNames, false);
  const passageBase = {
    index: z.number().int(),
    title: z.string(),
    type: z.string(),
    body: z.string(),
    questions: z.array(questionSchema),
  };
  const passageSchema = passagesHaveFigure
    ? z.object({ ...passageBase, figure: buildFigureSchema() })
    : z.object(passageBase);

  return z.object({
    passages: z.array(passageSchema),
  });
}

export function buildMathTestSchema(categoryNames: string[]) {
  return z.object({
    questions: z.array(buildQuestionSchema(categoryNames, true)),
  });
}
