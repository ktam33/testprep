import { describe, expect, it } from 'vitest';
import { Figure } from '@/types';
import { validateFigure } from './figureValidation';

function noneFigure(): Figure {
  return { kind: 'none', title: '', xLabel: '', yLabel: '', columns: [], rows: [], series: [] };
}

function tableFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    kind: 'table',
    title: 'Trial Results',
    xLabel: '',
    yLabel: '',
    columns: ['Trial', 'Temperature (C)'],
    rows: [
      ['1', '20'],
      ['2', '25'],
    ],
    series: [],
    ...overrides,
  };
}

function chartFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    kind: 'line',
    title: 'Temperature over Time',
    xLabel: 'Trial',
    yLabel: 'Temperature (C)',
    columns: [],
    rows: [],
    series: [{ label: 'Sample A', points: [{ x: 1, y: 20 }, { x: 2, y: 25 }] }],
    ...overrides,
  };
}

describe('validateFigure', () => {
  it('passes for kind: none regardless of other fields', () => {
    expect(validateFigure(noneFigure())).toEqual({ ok: true });
  });

  it('passes for a well-formed table', () => {
    expect(validateFigure(tableFigure())).toEqual({ ok: true });
  });

  it('fails for a table with no columns', () => {
    const result = validateFigure(tableFigure({ columns: [] }));
    expect(result.ok).toBe(false);
  });

  it('fails for a table with no rows', () => {
    const result = validateFigure(tableFigure({ rows: [] }));
    expect(result.ok).toBe(false);
  });

  it('fails for a table with a row length mismatched to columns', () => {
    const result = validateFigure(tableFigure({ rows: [['1', '20'], ['2']] }));
    expect(result.ok).toBe(false);
  });

  it('passes for a well-formed chart (line, bar, scatter)', () => {
    expect(validateFigure(chartFigure({ kind: 'line' }))).toEqual({ ok: true });
    expect(validateFigure(chartFigure({ kind: 'bar' }))).toEqual({ ok: true });
    expect(validateFigure(chartFigure({ kind: 'scatter' }))).toEqual({ ok: true });
  });

  it('fails for a chart with no series', () => {
    const result = validateFigure(chartFigure({ series: [] }));
    expect(result.ok).toBe(false);
  });

  it('fails for a chart with an empty series', () => {
    const result = validateFigure(
      chartFigure({ series: [{ label: 'Sample A', points: [] }] })
    );
    expect(result.ok).toBe(false);
  });
});
