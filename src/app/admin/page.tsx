'use client';

import { useCallback, useEffect, useState } from 'react';
import { Section, SECTION_LABELS, SECTIONS } from '@/types';
import LoadingSpinner from '@/components/LoadingSpinner';

interface PregenStatus {
  target: number;
  available: Record<Section, number>;
  generating: Section | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export default function AdminPage() {
  const [status, setStatus] = useState<PregenStatus | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pregen-status', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load status');
      setStatus(data);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000); // keep "currently generating" fresh
    return () => clearInterval(timer);
  }, [load]);

  if (error && !status) return <p className="text-sm text-red-600">{error}</p>;
  if (!status) return <LoadingSpinner label="Loading pre-generation status…" />;

  const totalAvailable = SECTIONS.reduce((sum, s) => sum + (status.available[s] ?? 0), 0);
  const totalTarget = SECTIONS.length * status.target;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Pre-generated Tests</h1>
        <button
          onClick={load}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <p className="text-sm text-gray-500">
        The background worker keeps up to {status.target} ready-to-use tests per subject ({totalAvailable}/{totalTarget}{' '}
        available). Starting a test uses a pool test instantly when one exists; otherwise it is generated on demand.
      </p>

      {status.generating ? (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
          <p className="text-sm text-blue-800">
            Currently generating a <strong>{SECTION_LABELS[status.generating]}</strong> test…
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-600">No test is currently being generated.</p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Available</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {SECTIONS.map((s) => {
              const available = status.available[s] ?? 0;
              const isGenerating = status.generating === s;
              const full = available >= status.target;
              return (
                <tr key={s}>
                  <td className="px-4 py-3 font-medium text-gray-900">{SECTION_LABELS[s]}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {available} / {status.target}
                  </td>
                  <td className="px-4 py-3">
                    {isGenerating ? (
                      <span className="inline-flex items-center gap-1.5 text-blue-700">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" /> generating…
                      </span>
                    ) : full ? (
                      <span className="text-green-700">full</span>
                    ) : (
                      <span className="text-amber-700">below target</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {status.lastError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <strong>Last generation error:</strong> {status.lastError}
          {status.lastErrorAt ? ` (${new Date(status.lastErrorAt).toLocaleString()})` : ''}
        </p>
      )}
    </div>
  );
}
