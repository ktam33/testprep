import { Figure } from '@/types';

const SERIES_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'];

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round((min + i * step) * 100) / 100);
}

export default function FigureView({ figure }: { figure: Figure | null }) {
  if (!figure || figure.kind === 'none') return null;
  return figure.kind === 'table' ? <TableFigure figure={figure} /> : <ChartFigure figure={figure} />;
}

function TableFigure({ figure }: { figure: Figure }) {
  return (
    <figure className="my-4">
      {figure.title && (
        <figcaption className="mb-2 text-sm font-semibold text-gray-700">{figure.title}</figcaption>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              {figure.columns.map((c, i) => (
                <th key={i} className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-700">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {figure.rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 text-gray-800">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function ChartFigure({ figure }: { figure: Figure }) {
  const width = 480;
  const height = 280;
  const padding = { top: 16, right: 16, bottom: 40, left: 50 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const allPoints = figure.series.flatMap((s) => s.points);
  if (allPoints.length === 0) return null;

  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const xMin = Math.min(...xs, 0);
  const xMax = Math.max(...xs, 1);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 1);

  const scaleX = (x: number) => padding.left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const scaleY = (y: number) => padding.top + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;

  const xTicks = niceTicks(xMin, xMax, 5);
  const yTicks = niceTicks(yMin, yMax, 5);

  // Grouped-bar layout: bars sharing an x value get their own slot within that x's column.
  const xValues = Array.from(new Set(xs)).sort((a, b) => a - b);
  const slotWidth = plotW / (xValues.length || 1);
  const barWidth = (slotWidth / figure.series.length) * 0.7;

  return (
    <figure className="my-4">
      {figure.title && (
        <figcaption className="mb-2 text-sm font-semibold text-gray-700">{figure.title}</figcaption>
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-xl" role="img" aria-label={figure.title}>
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#9ca3af" />
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="#9ca3af"
          />

          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              <line x1={padding.left - 4} y1={scaleY(t)} x2={padding.left} y2={scaleY(t)} stroke="#9ca3af" />
              <text x={padding.left - 8} y={scaleY(t) + 4} textAnchor="end" fontSize="10" fill="#6b7280">
                {t}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={`x-${t}`}>
              <line
                x1={scaleX(t)}
                y1={height - padding.bottom}
                x2={scaleX(t)}
                y2={height - padding.bottom + 4}
                stroke="#9ca3af"
              />
              <text x={scaleX(t)} y={height - padding.bottom + 16} textAnchor="middle" fontSize="10" fill="#6b7280">
                {t}
              </text>
            </g>
          ))}

          {figure.xLabel && (
            <text x={width / 2} y={height - 4} textAnchor="middle" fontSize="11" fill="#374151">
              {figure.xLabel}
            </text>
          )}
          {figure.yLabel && (
            <text
              x={12}
              y={height / 2}
              textAnchor="middle"
              fontSize="11"
              fill="#374151"
              transform={`rotate(-90 12 ${height / 2})`}
            >
              {figure.yLabel}
            </text>
          )}

          {figure.series.map((s, si) => {
            const color = SERIES_COLORS[si % SERIES_COLORS.length];

            if (figure.kind === 'bar') {
              return s.points.map((p, pi) => {
                const slotIndex = xValues.indexOf(p.x);
                const slotStart = padding.left + slotIndex * slotWidth;
                const barX = slotStart + si * (slotWidth / figure.series.length) + (slotWidth / figure.series.length - barWidth) / 2;
                const barY = scaleY(p.y);
                return (
                  <rect
                    key={pi}
                    x={barX}
                    y={barY}
                    width={barWidth}
                    height={height - padding.bottom - barY}
                    fill={color}
                  />
                );
              });
            }

            if (figure.kind === 'line') {
              const sorted = [...s.points].sort((a, b) => a.x - b.x);
              const d = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.x)} ${scaleY(p.y)}`).join(' ');
              return <path key={si} d={d} fill="none" stroke={color} strokeWidth={2} />;
            }

            // scatter
            return s.points.map((p, pi) => (
              <circle key={pi} cx={scaleX(p.x)} cy={scaleY(p.y)} r={4} fill={color} />
            ));
          })}
        </svg>
        {figure.series.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
            {figure.series.map((s, i) => (
              <span key={i} className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
                />
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
