import { Question } from '@/types';
import FigureView from './FigureView';

interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  mode: 'take' | 'review';
  selectedAnswerIndex: number | null;
  onSelect?: (choiceIndex: number) => void;
}

export default function QuestionCard({
  question,
  questionNumber,
  mode,
  selectedAnswerIndex,
  onSelect,
}: QuestionCardProps) {
  return (
    <div className="border-t border-gray-100 pt-4 first:border-0 first:pt-0">
      <p className="mb-3 font-medium text-gray-900">
        {questionNumber}.{question.prompt ? ` ${question.prompt}` : ''}
      </p>
      <FigureView figure={question.figure} />
      <div className="space-y-2">
        {question.choices.map((choice, i) => {
          const isSelected = selectedAnswerIndex === i;
          const isCorrectChoice = mode === 'review' && question.correctAnswerIndex === i;
          const isWrongSelected = mode === 'review' && isSelected && question.correctAnswerIndex !== i;

          const classes = [
            'flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left text-sm transition',
            mode === 'take' ? 'cursor-pointer hover:border-blue-400' : '',
            isCorrectChoice ? 'border-green-400 bg-green-50' : '',
            isWrongSelected ? 'border-red-400 bg-red-50' : '',
            !isCorrectChoice && !isWrongSelected && isSelected ? 'border-blue-400 bg-blue-50' : '',
            !isSelected && !isCorrectChoice ? 'border-gray-200' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button key={i} type="button" disabled={mode === 'review'} onClick={() => onSelect?.(i)} className={classes}>
              <span className="font-semibold text-gray-500">{String.fromCharCode(65 + i)}.</span>
              <span className="text-gray-800">{choice}</span>
            </button>
          );
        })}
      </div>
      {mode === 'review' && question.explanation && (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <strong className="text-gray-800">Explanation: </strong>
          {question.explanation}
        </p>
      )}
    </div>
  );
}
