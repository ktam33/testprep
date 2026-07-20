import { ReactNode } from 'react';
import { Passage } from '@/types';

export default function PassageView({ passage, children }: { passage: Passage; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-600">
        Passage {passage.passageIndex + 1}
        {passage.passageType ? ` · ${passage.passageType}` : ''}
      </p>
      {passage.title && <h3 className="mb-3 text-lg font-semibold text-gray-900">{passage.title}</h3>}
      <p className="mb-6 whitespace-pre-line leading-relaxed text-gray-700">{passage.body}</p>
      <div className="space-y-6">{children}</div>
    </section>
  );
}
