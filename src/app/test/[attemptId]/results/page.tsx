'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CategoryStat, Passage, Question, SECTION_LABELS, TestAttemptDetail } from '@/types';
import { getCurrentUser } from '@/utils/session';
import PassageView from '@/components/PassageView';
import QuestionCard from '@/components/QuestionCard';
import ResultsSummary from '@/components/ResultsSummary';
import LoadingSpinner from '@/components/LoadingSpinner';

interface QuestionGroup {
  passage: Passage | null;
  questions: Question[];
}

function groupByPassage(attempt: TestAttemptDetail): QuestionGroup[] {
  const passagesById = new Map(attempt.passages.map((p) => [p.id, p]));
  const groups: QuestionGroup[] = [];
  for (const q of attempt.questions) {
    const passage = q.passageId !== null ? passagesById.get(q.passageId) ?? null : null;
    const last = groups[groups.length - 1];
    if (last && (last.passage?.id ?? null) === (passage?.id ?? null)) {
      last.questions.push(q);
    } else {
      groups.push({ passage, questions: [q] });
    }
  }
  return groups;
}

export default function ResultsPage() {
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const attemptId = params.attemptId;

  const [attempt, setAttempt] = useState<TestAttemptDetail | null>(null);
  const [breakdown, setBreakdown] = useState<CategoryStat[]>([]);
  const [responsesByQuestionId, setResponsesByQuestionId] = useState<Record<number, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Kept separate from `error`: a load failure replaces the page, a delete failure
  // should leave the results on screen and just report itself.
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/tests/${attemptId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load test');
      if (data.attempt.status !== 'completed') {
        router.replace(`/test/${attemptId}`);
        return;
      }
      setAttempt(data.attempt);
      setBreakdown(data.categoryBreakdown ?? []);
      const map: Record<number, number | null> = {};
      for (const r of data.attempt.responses ?? []) {
        map[r.questionId] = r.selectedAnswerIndex;
      }
      setResponsesByQuestionId(map);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!attempt) return;
    const user = getCurrentUser();
    if (!user) {
      router.replace('/');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/tests/${attemptId}?userId=${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete attempt');
      router.replace(`/sections/${attempt.section}`);
    } catch (err: any) {
      setDeleteError(err.message);
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  if (loading) return <LoadingSpinner label="Loading results…" />;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!attempt) return null;

  const groups = groupByPassage(attempt);
  let questionNumber = 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{SECTION_LABELS[attempt.section]} Results</h1>
        <Link href={`/sections/${attempt.section}`} className="text-sm text-blue-600 hover:underline">
          Back to {SECTION_LABELS[attempt.section]}
        </Link>
      </div>

      <ResultsSummary attempt={attempt} categoryBreakdown={breakdown} />

      <h2 className="text-lg font-semibold text-gray-900">Review</h2>

      {groups.map((group, i) => {
        const groupFirstNumber = questionNumber + 1;
        return group.passage ? (
          <PassageView key={group.passage.id} passage={group.passage} firstQuestionNumber={groupFirstNumber}>
            {group.questions.map((q) => {
              questionNumber += 1;
              return (
                <QuestionCard
                  key={q.id}
                  question={q}
                  questionNumber={questionNumber}
                  mode="review"
                  selectedAnswerIndex={responsesByQuestionId[q.id] ?? null}
                />
              );
            })}
          </PassageView>
        ) : (
          <div key={i} className="space-y-6 rounded-xl border border-gray-200 bg-white p-6">
            {group.questions.map((q) => {
              questionNumber += 1;
              return (
                <QuestionCard
                  key={q.id}
                  question={q}
                  questionNumber={questionNumber}
                  mode="review"
                  selectedAnswerIndex={responsesByQuestionId[q.id] ?? null}
                />
              );
            })}
          </div>
        );
      })}

      <div className="flex flex-col items-center gap-3 pb-8">
        {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
        <div className="flex justify-center gap-4">
          <Link href={`/sections/${attempt.section}`} className="text-sm text-blue-600 hover:underline">
            Back to {SECTION_LABELS[attempt.section]}
          </Link>
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
            Dashboard
          </Link>
        </div>
        {confirmingDelete ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">
              Delete this attempt? Its results stop counting toward your stats and the next test&apos;s
              question mix.
            </span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md bg-red-600 px-3 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="rounded-md px-3 py-1 font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-sm text-gray-400 hover:text-red-600 hover:underline"
          >
            Delete this attempt
          </button>
        )}
      </div>
    </div>
  );
}
