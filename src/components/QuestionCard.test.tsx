import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import QuestionCard from './QuestionCard';
import { Question } from '@/types';

const question: Question = {
  id: 1,
  testAttemptId: 1,
  passageId: null,
  categoryId: 1,
  categoryName: 'Arithmetic',
  questionIndex: 0,
  prompt: 'What is 2 + 2?',
  choices: ['3', '4', '5', '6'],
  correctAnswerIndex: 1,
  explanation: 'Add the two numbers.',
  difficulty: null,
  figure: null,
};

function review(selectedAnswerIndex: number | null) {
  return renderToStaticMarkup(
    <QuestionCard question={question} questionNumber={1} mode="review" selectedAnswerIndex={selectedAnswerIndex} />
  );
}

describe('QuestionCard review mode', () => {
  it('labels a skipped question distinctly from a correct one', () => {
    const skipped = review(null);
    expect(skipped).toContain('>Skipped<');
    expect(skipped).toContain('Skipped — Explanation: ');
    // The correct choice is shown for reference, not as a green "you got it".
    expect(skipped).not.toContain('bg-green-50');
    expect(skipped).toContain('Correct answer');
    expect(skipped).not.toContain('Your answer');
  });

  it('marks a correct answer green and attributes it to the user', () => {
    const correct = review(1);
    expect(correct).toContain('>Correct<');
    expect(correct).toContain('bg-green-50');
    expect(correct).toContain('Your answer ✓');
    expect(correct).not.toContain('Skipped');
  });

  it('marks a wrong answer alongside the correct choice', () => {
    const wrong = review(0);
    expect(wrong).toContain('>Incorrect<');
    expect(wrong).toContain('bg-red-50');
    expect(wrong).toContain('Your answer<');
    expect(wrong).toContain('Correct answer');
  });

  it('shows no status badge or explanation while taking the test', () => {
    const taking = renderToStaticMarkup(
      <QuestionCard question={question} questionNumber={1} mode="take" selectedAnswerIndex={null} />
    );
    expect(taking).not.toContain('Skipped');
    expect(taking).not.toContain('Explanation');
  });
});
