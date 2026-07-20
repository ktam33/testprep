import { describe, expect, it } from 'vitest';
import { gradeQuestions } from './grading';

describe('gradeQuestions', () => {
  const questions = [
    { id: 1, correctAnswerIndex: 0 },
    { id: 2, correctAnswerIndex: 2 },
    { id: 3, correctAnswerIndex: 1 },
  ];

  it('grades correct and incorrect selections', () => {
    const { results, scoreCorrect, scoreTotal } = gradeQuestions(questions, [
      { questionId: 1, selectedAnswerIndex: 0 }, // correct
      { questionId: 2, selectedAnswerIndex: 1 }, // incorrect
      { questionId: 3, selectedAnswerIndex: 1 }, // correct
    ]);

    expect(results).toEqual([
      { questionId: 1, selectedAnswerIndex: 0, isCorrect: true },
      { questionId: 2, selectedAnswerIndex: 1, isCorrect: false },
      { questionId: 3, selectedAnswerIndex: 1, isCorrect: true },
    ]);
    expect(scoreCorrect).toBe(2);
    expect(scoreTotal).toBe(3);
  });

  it('grades a missing response as incorrect/blank', () => {
    const { results, scoreCorrect } = gradeQuestions(questions, [{ questionId: 1, selectedAnswerIndex: 0 }]);

    expect(results.find((r) => r.questionId === 2)).toEqual({
      questionId: 2,
      selectedAnswerIndex: null,
      isCorrect: false,
    });
    expect(scoreCorrect).toBe(1);
  });

  it('grades an explicit null selection as incorrect/blank', () => {
    const { results } = gradeQuestions(questions, [{ questionId: 2, selectedAnswerIndex: null }]);
    expect(results.find((r) => r.questionId === 2)?.isCorrect).toBe(false);
  });

  it('is stable with an empty responses array', () => {
    const { results, scoreCorrect, scoreTotal } = gradeQuestions(questions, []);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.isCorrect === false)).toBe(true);
    expect(scoreCorrect).toBe(0);
    expect(scoreTotal).toBe(3);
  });

  it('handles zero questions', () => {
    const { results, scoreCorrect, scoreTotal } = gradeQuestions([], []);
    expect(results).toEqual([]);
    expect(scoreCorrect).toBe(0);
    expect(scoreTotal).toBe(0);
  });
});
