import Link from 'next/link';
import { TestAttempt } from '@/types';

export default function AttemptHistoryList({ attempts }: { attempts: TestAttempt[] }) {
  if (attempts.length === 0) {
    return <p className="text-sm text-gray-500">No practice tests yet — start one above.</p>;
  }

  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {attempts.map((a) => (
        <li key={a.id}>
          <Link
            href={a.status === 'completed' ? `/test/${a.id}/results` : `/test/${a.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
          >
            <p className="font-medium text-gray-900">
              {new Date(a.startedAt).toLocaleDateString()}{' '}
              <span className="font-normal text-gray-500">
                · {a.status === 'completed' ? 'Completed' : 'In progress'}
              </span>
            </p>
            <p className="font-medium text-gray-900">
              {a.status === 'completed' && a.scoreCorrect !== null && a.scoreTotal !== null
                ? `${a.scoreCorrect}/${a.scoreTotal}`
                : '—'}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
