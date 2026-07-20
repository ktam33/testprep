'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SectionProgressSummary } from '@/types';
import { getCurrentUser } from '@/utils/session';
import SectionCard from '@/components/SectionCard';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<SectionProgressSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.replace('/');
      return;
    }
    fetch(`/api/progress?userId=${user.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSummary(data.summary ?? []);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingSpinner label="Loading your progress…" />;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Your Progress</h1>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {summary.map((s) => (
          <SectionCard key={s.section} summary={s} />
        ))}
      </div>
    </div>
  );
}
