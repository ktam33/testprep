import { CategoryStat, TestAttempt } from '@/types';
import CategoryAccuracyTable from './CategoryAccuracyTable';

export default function ResultsSummary({
  attempt,
  categoryBreakdown,
}: {
  attempt: TestAttempt;
  categoryBreakdown: CategoryStat[];
}) {
  const pct =
    attempt.scoreTotal && attempt.scoreCorrect !== null
      ? Math.round((attempt.scoreCorrect / attempt.scoreTotal) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-gray-500">Your score</p>
        <p className="text-4xl font-bold text-gray-900">
          {attempt.scoreCorrect}/{attempt.scoreTotal}
        </p>
        <p className="text-gray-600">{pct}%</p>
      </div>
      <CategoryAccuracyTable stats={categoryBreakdown} />
    </div>
  );
}
