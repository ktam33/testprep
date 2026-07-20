'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Passage, Question, TestAttemptDetail } from '@/types';
import PassageView from '@/components/PassageView';
import QuestionCard from '@/components/QuestionCard';
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

export default function TakeTestPage() {
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const attemptId = params.attemptId;

  const [attempt, setAttempt] = useState<TestAttemptDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAttempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  async function loadAttempt() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/tests/${attemptId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load test');
      if (data.attempt.status === 'completed') {
        router.replace(`/test/${attemptId}/results`);
        return;
      }
      setAttempt(data.attempt);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function selectAnswer(questionId: number, choiceIndex: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceIndex }));
  }

  async function handleSubmit() {
    if (!attempt) return;
    setSubmitting(true);
    setError('');
    try {
      const responses = attempt.questions.map((q) => ({
        questionId: q.id,
        selectedAnswerIndex: answers[q.id] ?? null,
      }));
      const res = await fetch(`/api/tests/${attemptId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit test');
      router.push(`/test/${attemptId}/results`);
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingSpinner label="Loading test…" />;
  if (error && !attempt) return <p className="text-sm text-red-600">{error}</p>;
  if (!attempt) return null;

  const groups = groupByPassage(attempt);
  const answeredCount = Object.keys(answers).length;
  let questionNumber = 0;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Practice Test</h1>
        <p className="text-sm text-gray-500">
          {answeredCount}/{attempt.questions.length} answered
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

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
                  mode="take"
                  selectedAnswerIndex={answers[q.id] ?? null}
                  onSelect={(choice) => selectAnswer(q.id, choice)}
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
                  mode="take"
                  selectedAnswerIndex={answers[q.id] ?? null}
                  onSelect={(choice) => selectAnswer(q.id, choice)}
                />
              );
            })}
          </div>
        )
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <p className="text-sm text-gray-600">
            {answeredCount}/{attempt.questions.length} answered
          </p>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit Test'}
          </button>
        </div>
      </div>
    </div>
  );
}
