import Link from 'next/link';
import { SectionProgressSummary, SECTION_LABELS } from '@/types';

export default function SectionCard({ summary }: { summary: SectionProgressSummary }) {
  const { section, attemptCount, averageScore, lastAttemptAt, weakestCategory } = summary;
  return (
    <Link
      href={`/sections/${section}`}
      className="block rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-400 hover:shadow-md"
    >
      <h2 className="text-xl font-semibold text-gray-900">{SECTION_LABELS[section]}</h2>
      <dl className="mt-4 space-y-1 text-sm text-gray-600">
        <div className="flex justify-between">
          <dt>Practice tests taken</dt>
          <dd className="font-medium text-gray-900">{attemptCount}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Average score</dt>
          <dd className="font-medium text-gray-900">
            {averageScore !== null ? `${Math.round(averageScore * 100)}%` : '—'}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Last attempt</dt>
          <dd className="font-medium text-gray-900">
            {lastAttemptAt ? new Date(lastAttemptAt).toLocaleDateString() : '—'}
          </dd>
        </div>
        {weakestCategory && (
          <div className="flex justify-between">
            <dt>Focus area</dt>
            <dd className="font-medium text-amber-700">{weakestCategory}</dd>
          </div>
        )}
      </dl>
    </Link>
  );
}
