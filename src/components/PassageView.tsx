import { ReactNode } from 'react';
import { Passage } from '@/types';
import FigureView from './FigureView';

export default function PassageView({
  passage,
  firstQuestionNumber,
  children,
}: {
  passage: Passage;
  // Global (displayed) number of this passage's first question, used to number the
  // underlined portions in the ACT/PreACT English format. Only needed for English.
  firstQuestionNumber?: number;
  children: ReactNode;
}) {
  const hasSegments = passage.segments != null && passage.segments.length > 0;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-600">
        Passage {passage.passageIndex + 1}
        {passage.passageType ? ` · ${passage.passageType}` : ''}
      </p>
      {passage.title && <h3 className="mb-3 text-lg font-semibold text-gray-900">{passage.title}</h3>}
      {hasSegments ? (
        <p className="mb-6 whitespace-pre-line leading-relaxed text-gray-700">
          {passage.segments!.map((seg, i) => {
            if (seg.questionRef === -1) return <span key={i}>{seg.text}</span>;
            const number = (firstQuestionNumber ?? 1) + seg.questionRef;
            return (
              <span key={i}>
                <span className="underline decoration-blue-400 decoration-2 underline-offset-2">{seg.text}</span>
                <sup className="ml-0.5 font-semibold text-blue-600">{number}</sup>
              </span>
            );
          })}
        </p>
      ) : (
        <p className="mb-6 whitespace-pre-line leading-relaxed text-gray-700">{passage.body}</p>
      )}
      <FigureView figure={passage.figure} />
      <div className="space-y-6">{children}</div>
    </section>
  );
}
