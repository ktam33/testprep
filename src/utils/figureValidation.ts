import { Figure } from '@/types';

export type FigureValidationResult = { ok: true } | { ok: false; reason: string };

export function validateFigure(figure: Figure): FigureValidationResult {
  if (figure.kind === 'none') return { ok: true };

  if (figure.kind === 'table') {
    if (figure.columns.length === 0) {
      return { ok: false, reason: `Table figure "${figure.title}" must have at least one column.` };
    }
    if (figure.rows.length === 0) {
      return { ok: false, reason: `Table figure "${figure.title}" must have at least one row.` };
    }
    const badRow = figure.rows.find((row) => row.length !== figure.columns.length);
    if (badRow) {
      return {
        ok: false,
        reason: `Every row in table figure "${figure.title}" must have exactly ${figure.columns.length} cells (one per column).`,
      };
    }
    return { ok: true };
  }

  // bar | line | scatter
  if (figure.series.length === 0) {
    return { ok: false, reason: `Chart figure "${figure.title}" must have at least one data series.` };
  }
  const emptySeries = figure.series.find((s) => s.points.length === 0);
  if (emptySeries) {
    return {
      ok: false,
      reason: `Series "${emptySeries.label}" in chart figure "${figure.title}" has no data points.`,
    };
  }
  return { ok: true };
}
