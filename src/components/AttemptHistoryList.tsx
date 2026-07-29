'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TestAttempt } from '@/types';

interface Props {
  attempts: TestAttempt[];
  onDelete: (attemptId: number) => Promise<void>;
}

export default function AttemptHistoryList({ attempts, onDelete }: Props) {
  // Two-step inline confirm rather than window.confirm: deleting an attempt permanently
  // rewrites the student's stats, so it should never be one stray click away.
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleDelete(attemptId: number) {
    setDeletingId(attemptId);
    try {
      await onDelete(attemptId);
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  if (attempts.length === 0) {
    return <p className="text-sm text-gray-500">No practice tests yet — start one above.</p>;
  }

  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {attempts.map((a) => (
        <li key={a.id} className="flex items-center gap-2 pr-3 hover:bg-gray-50">
          <Link
            href={a.status === 'completed' ? `/test/${a.id}/results` : `/test/${a.id}`}
            className="flex flex-1 items-center justify-between px-4 py-3"
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

          {confirmingId === a.id ? (
            <span className="flex items-center gap-2 whitespace-nowrap text-sm">
              <span className="text-gray-500">Delete?</span>
              <button
                onClick={() => handleDelete(a.id)}
                disabled={deletingId === a.id}
                className="rounded-md bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingId === a.id ? 'Deleting…' : 'Yes'}
              </button>
              <button
                onClick={() => setConfirmingId(null)}
                disabled={deletingId === a.id}
                className="rounded-md px-2 py-1 font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingId(a.id)}
              aria-label={`Delete attempt from ${new Date(a.startedAt).toLocaleDateString()}`}
              className="rounded-md px-2 py-1 text-sm font-medium text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              Delete
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
