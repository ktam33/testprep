export interface GradableQuestion {
  id: number;
  correctAnswerIndex: number;
}

export interface SubmittedResponse {
  questionId: number;
  selectedAnswerIndex: number | null;
}

export interface GradedResult {
  questionId: number;
  selectedAnswerIndex: number | null;
  isCorrect: boolean;
}

export interface GradingSummary {
  results: GradedResult[];
  scoreCorrect: number;
  scoreTotal: number;
}

// Unanswered questions (no entry in `responses`, or an explicit null selection) grade as incorrect.
export function gradeQuestions(
  questions: GradableQuestion[],
  responses: SubmittedResponse[]
): GradingSummary {
  const selectedByQuestionId = new Map<number, number | null>(
    responses.map((r) => [r.questionId, r.selectedAnswerIndex])
  );

  const results: GradedResult[] = questions.map((q) => {
    const selectedAnswerIndex = selectedByQuestionId.has(q.id) ? selectedByQuestionId.get(q.id)! : null;
    const isCorrect = selectedAnswerIndex !== null && selectedAnswerIndex === q.correctAnswerIndex;
    return { questionId: q.id, selectedAnswerIndex, isCorrect };
  });

  const scoreCorrect = results.filter((r) => r.isCorrect).length;

  return { results, scoreCorrect, scoreTotal: questions.length };
}
