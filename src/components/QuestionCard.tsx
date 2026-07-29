import { Question } from '@/types';
import FigureView from './FigureView';
import MathText from './MathText';

interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  mode: 'take' | 'review';
  selectedAnswerIndex: number | null;
  onSelect?: (choiceIndex: number) => void;
}

type ReviewStatus = 'correct' | 'incorrect' | 'skipped';

const STATUS_BADGE: Record<ReviewStatus, { label: string; classes: string }> = {
  correct: { label: 'Correct', classes: 'border-green-300 bg-green-50 text-green-700' },
  incorrect: { label: 'Incorrect', classes: 'border-red-300 bg-red-50 text-red-700' },
  skipped: { label: 'Skipped', classes: 'border-amber-300 bg-amber-50 text-amber-700' },
};

const EXPLANATION_STYLES: Record<ReviewStatus, string> = {
  correct: 'bg-gray-50 text-gray-600',
  incorrect: 'bg-gray-50 text-gray-600',
  skipped: 'border border-amber-200 bg-amber-50 text-amber-900',
};

export default function QuestionCard({
  question,
  questionNumber,
  mode,
  selectedAnswerIndex,
  onSelect,
}: QuestionCardProps) {
  const status: ReviewStatus | null =
    mode !== 'review'
      ? null
      : selectedAnswerIndex === null
        ? 'skipped'
        : selectedAnswerIndex === question.correctAnswerIndex
          ? 'correct'
          : 'incorrect';

  return (
    <div className="border-t border-gray-100 pt-4 first:border-0 first:pt-0">
      {status && (
        <span
          className={`mb-2 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[status].classes}`}
        >
          {STATUS_BADGE[status].label}
        </span>
      )}
      <p className="mb-3 font-medium text-gray-900">
        {questionNumber}.{question.prompt ? <> <MathText>{question.prompt}</MathText></> : ''}
      </p>
      <FigureView figure={question.figure} />
      <div className="space-y-2">
        {question.choices.map((choice, i) => {
          const isSelected = selectedAnswerIndex === i;
          const isCorrectChoice = mode === 'review' && question.correctAnswerIndex === i;
          const isWrongSelected = mode === 'review' && isSelected && question.correctAnswerIndex !== i;
          // On a skipped question nothing was chosen, so the correct answer is shown as
          // information (amber, matching the badge) rather than as a green "you got it".
          const isUnclaimedCorrect = isCorrectChoice && status === 'skipped';

          const classes = [
            'flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left text-sm transition',
            mode === 'take' ? 'cursor-pointer hover:border-blue-400' : '',
            isUnclaimedCorrect ? 'border-dashed border-amber-400 bg-amber-50' : '',
            isCorrectChoice && !isUnclaimedCorrect ? 'border-green-400 bg-green-50' : '',
            isWrongSelected ? 'border-red-400 bg-red-50' : '',
            !isCorrectChoice && !isWrongSelected && isSelected ? 'border-blue-400 bg-blue-50' : '',
            !isSelected && !isCorrectChoice ? 'border-gray-200' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button key={i} type="button" disabled={mode === 'review'} onClick={() => onSelect?.(i)} className={classes}>
              <span className="font-semibold text-gray-500">{String.fromCharCode(65 + i)}.</span>
              <MathText className="text-gray-800">{choice}</MathText>
              {mode === 'review' && (isSelected || isCorrectChoice) && (
                <span className="ml-auto shrink-0 self-center text-xs font-medium text-gray-500">
                  {isSelected && isCorrectChoice
                    ? 'Your answer ✓'
                    : isSelected
                      ? 'Your answer'
                      : 'Correct answer'}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {mode === 'review' && question.explanation && status && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${EXPLANATION_STYLES[status]}`}>
          <strong className={status === 'skipped' ? 'text-amber-900' : 'text-gray-800'}>
            {status === 'skipped' ? 'Skipped — Explanation: ' : 'Explanation: '}
          </strong>
          <MathText>{question.explanation}</MathText>
        </p>
      )}
    </div>
  );
}
