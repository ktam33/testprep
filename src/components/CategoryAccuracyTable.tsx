import { CategoryStat } from '@/types';

export default function CategoryAccuracyTable({ stats }: { stats: CategoryStat[] }) {
  const sorted = [...stats].sort((a, b) => {
    const aAcc = a.attempts > 0 ? a.correct / a.attempts : -1;
    const bAcc = b.attempts > 0 ? b.correct / b.attempts : -1;
    return aAcc - bAcc;
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
            <th className="px-4 py-2 font-medium">Category</th>
            <th className="px-4 py-2 font-medium">Group</th>
            <th className="px-4 py-2 font-medium">Accuracy</th>
            <th className="px-4 py-2 font-medium">Attempts</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const accuracy = s.attempts > 0 ? s.correct / s.attempts : null;
            return (
              <tr key={s.categoryId} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2 text-gray-900">{s.categoryName}</td>
                <td className="px-4 py-2 text-gray-500">{s.groupName}</td>
                <td className="px-4 py-2">
                  {accuracy !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full ${
                            accuracy < 0.5 ? 'bg-red-400' : accuracy < 0.8 ? 'bg-amber-400' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.round(accuracy * 100)}%` }}
                        />
                      </div>
                      <span className="text-gray-700">{Math.round(accuracy * 100)}%</span>
                    </div>
                  ) : (
                    <span className="text-gray-400">Not attempted</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">{s.attempts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
