'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CategoryStat, Section, SECTIONS, SECTION_LABELS, TestAttempt } from '@/types';
import { getCurrentUser } from '@/utils/session';
import CategoryAccuracyTable from '@/components/CategoryAccuracyTable';
import AttemptHistoryList from '@/components/AttemptHistoryList';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function SectionDetailPage() {
  const params = useParams<{ section: string }>();
  const router = useRouter();
  const section = params.section as Section;

  const [userId, setUserId] = useState<number | null>(null);
  const [stats, setStats] = useState<CategoryStat[]>([]);
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!(SECTIONS as string[]).includes(section)) {
      router.replace('/dashboard');
      return;
    }
    const user = getCurrentUser();
    if (!user) {
      router.replace('/');
      return;
    }
    setUserId(user.id);
    loadProgress(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  async function loadProgress(uid: number) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/progress/${section}?userId=${uid}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load progress');
      setStats(data.categoryStats ?? []);
      setAttempts(data.attempts ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function startTest() {
    if (!userId) return;
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/tests/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate test');
      router.push(`/test/${data.attemptId}`);
    } catch (err: any) {
      setError(err.message);
      setGenerating(false);
    }
  }

  if (loading) return <LoadingSpinner label="Loading section progress…" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{SECTION_LABELS[section]}</h1>
        <button
          onClick={startTest}
          disabled={generating}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {generating ? 'Generating test… (can take a minute)' : 'Start New Practice Test'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Category Accuracy</h2>
        <CategoryAccuracyTable stats={stats} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Attempt History</h2>
        <AttemptHistoryList attempts={attempts} />
      </section>
    </div>
  );
}
