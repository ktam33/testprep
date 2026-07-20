import { z } from 'zod';

function toNonEmptyTuple(values: string[]): [string, ...string[]] {
  if (values.length === 0) throw new Error('Expected at least one category name');
  return values as [string, ...string[]];
}

export function buildQuestionSchema(categoryNames: string[]) {
  return z.object({
    index: z.number().int(),
    category: z.enum(toNonEmptyTuple(categoryNames)),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    prompt: z.string(),
    choices: z.array(z.string()).length(4),
    correctAnswerIndex: z.number().int().min(0).max(3),
    explanation: z.string(),
  });
}

export function buildPassageTestSchema(categoryNames: string[]) {
  return z.object({
    passages: z.array(
      z.object({
        index: z.number().int(),
        title: z.string(),
        type: z.string(),
        body: z.string(),
        questions: z.array(buildQuestionSchema(categoryNames)),
      })
    ),
  });
}

export function buildMathTestSchema(categoryNames: string[]) {
  return z.object({
    questions: z.array(buildQuestionSchema(categoryNames)),
  });
}
