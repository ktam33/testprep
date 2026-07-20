'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CategoryStat, Passage, Question, SECTION_LABELS, TestAttemptDetail } from '@/types';
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

      {groups.map((group, i) =>
        group.passage ? (
          <PassageView key={group.passage.id} passage={group.passage}>
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
        )
      )}

      <div className="flex justify-center gap-4 pb-8">
        <Link href={`/sections/${attempt.section}`} className="text-sm text-blue-600 hover:underline">
          Back to {SECTION_LABELS[attempt.section]}
        </Link>
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
