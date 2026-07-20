import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { Figure } from '@/types';
import {
  createDb,
  createUser,
  getAttemptCategoryBreakdown,
  getAttemptDetail,
  getCategoryStats,
  getProgressSummary,
  listAttempts,
  listUsers,
  persistGeneratedTest,
  submitAttempt,
} from './db';

let db: Database.Database;

beforeEach(() => {
  db = createDb(':memory:');
});

describe('schema + seeding', () => {
  it('is idempotent to re-run', () => {
    expect(() => createDb(':memory:')).not.toThrow();
  });

  it('seeds exactly 57 categories split 16/18/12/11 by section', () => {
    const counts = db
      .prepare('SELECT section, COUNT(*) as n FROM categories GROUP BY section')
      .all() as { section: string; n: number }[];
    const bySection = Object.fromEntries(counts.map((c) => [c.section, c.n]));
    expect(bySection.english).toBe(16);
    expect(bySection.math).toBe(18);
    expect(bySection.reading).toBe(12);
    expect(bySection.science).toBe(11);
    const total = counts.reduce((sum, c) => sum + c.n, 0);
    expect(total).toBe(57);
  });
});

describe('users', () => {
  it('creates and lists users', () => {
    createUser(db, 'Alice');
    createUser(db, 'Bob');
    const users = listUsers(db);
    expect(users.map((u) => u.name).sort()).toEqual(['Alice', 'Bob']);
  });

  it('rejects a duplicate name', () => {
    createUser(db, 'Alice');
    expect(() => createUser(db, 'Alice')).toThrow();
  });

  it('rejects a blank name', () => {
    expect(() => createUser(db, '   ')).toThrow();
  });
});

function categoryIdsFor(section: 'english' | 'math' | 'reading' | 'science') {
  return (
    db.prepare('SELECT id, name FROM categories WHERE section = ? ORDER BY sort_order').all(section) as {
      id: number;
      name: string;
    }[]
  );
}

describe('getCategoryStats', () => {
  it('returns every category for a section, including never-attempted ones (cold start)', () => {
    const user = createUser(db, 'Alice');
    const stats = getCategoryStats(db, user.id, 'math');
    expect(stats).toHaveLength(18);
    expect(stats.every((s) => s.attempts === 0 && s.correct === 0)).toBe(true);
  });

  it('computes correct aggregate counts after grading responses', () => {
    const user = createUser(db, 'Alice');
    const [cat1, cat2] = categoryIdsFor('math');

    const attemptId = persistGeneratedTest(
      db,
      user.id,
      'math',
      [],
      [
        {
          questionIndex: 0,
          passageIndex: null,
          categoryName: cat1.name,
          difficulty: 'easy',
          prompt: 'Q1',
          choices: ['a', 'b', 'c', 'd'],
          correctAnswerIndex: 0,
          explanation: 'because',
          figure: null,
        },
        {
          questionIndex: 1,
          passageIndex: null,
          categoryName: cat1.name,
          difficulty: 'easy',
          prompt: 'Q2',
          choices: ['a', 'b', 'c', 'd'],
          correctAnswerIndex: 1,
          explanation: 'because',
          figure: null,
        },
        {
          questionIndex: 2,
          passageIndex: null,
          categoryName: cat2.name,
          difficulty: 'easy',
          prompt: 'Q3',
          choices: ['a', 'b', 'c', 'd'],
          correctAnswerIndex: 2,
          explanation: 'because',
          figure: null,
        },
      ]
    );

    const detail = getAttemptDetail(db, attemptId, { includeAnswers: true })!;
    submitAttempt(
      db,
      attemptId,
      detail.questions.map((q) => ({ questionId: q.id, selectedAnswerIndex: q.correctAnswerIndex }))
      // all correct
    );

    const stats = getCategoryStats(db, user.id, 'math');
    const cat1Stats = stats.find((s) => s.categoryId === cat1.id)!;
    const cat2Stats = stats.find((s) => s.categoryId === cat2.id)!;
    expect(cat1Stats.attempts).toBe(2);
    expect(cat1Stats.correct).toBe(2);
    expect(cat2Stats.attempts).toBe(1);
    expect(cat2Stats.correct).toBe(1);
  });

  it('isolates stats between users', () => {
    const alice = createUser(db, 'Alice');
    const bob = createUser(db, 'Bob');
    const [cat1] = categoryIdsFor('math');

    const attemptId = persistGeneratedTest(
      db,
      alice.id,
      'math',
      [],
      [
        {
          questionIndex: 0,
          passageIndex: null,
          categoryName: cat1.name,
          difficulty: 'easy',
          prompt: 'Q1',
          choices: ['a', 'b', 'c', 'd'],
          correctAnswerIndex: 0,
          explanation: 'because',
          figure: null,
        },
      ]
    );
    const detail = getAttemptDetail(db, attemptId, { includeAnswers: true })!;
    submitAttempt(db, attemptId, [{ questionId: detail.questions[0].id, selectedAnswerIndex: 0 }]);

    const aliceStats = getCategoryStats(db, alice.id, 'math').find((s) => s.categoryId === cat1.id)!;
    const bobStats = getCategoryStats(db, bob.id, 'math').find((s) => s.categoryId === cat1.id)!;
    expect(aliceStats.attempts).toBe(1);
    expect(bobStats.attempts).toBe(0);
  });
});

describe('persistGeneratedTest + getAttemptDetail', () => {
  it('persists passages and questions and strips answers unless requested', () => {
    const user = createUser(db, 'Alice');
    const categories = categoriesForEnglish(db);

    const attemptId = persistGeneratedTest(
      db,
      user.id,
      'english',
      [{ passageIndex: 0, passageType: 'English Passage', title: 'T', body: 'Body text.', figure: null }],
      [
        {
          questionIndex: 0,
          passageIndex: 0,
          categoryName: categories[0].name,
          difficulty: 'medium',
          prompt: 'Which is correct?',
          choices: ['a', 'b', 'c', 'd'],
          correctAnswerIndex: 1,
          explanation: 'explanation text',
          figure: null,
        },
      ]
    );

    const inProgress = getAttemptDetail(db, attemptId, { includeAnswers: false })!;
    expect(inProgress.passages).toHaveLength(1);
    expect(inProgress.questions).toHaveLength(1);
    expect(inProgress.questions[0].correctAnswerIndex).toBeNull();
    expect(inProgress.questions[0].explanation).toBeNull();

    const withAnswers = getAttemptDetail(db, attemptId, { includeAnswers: true })!;
    expect(withAnswers.questions[0].correctAnswerIndex).toBe(1);
    expect(withAnswers.questions[0].explanation).toBe('explanation text');
  });

  function categoriesForEnglish(database: Database.Database) {
    return database
      .prepare('SELECT id, name FROM categories WHERE section = ? ORDER BY sort_order')
      .all('english') as { id: number; name: string }[];
  }
});

describe('figure persistence', () => {
  it('round-trips a table figure on a passage and a chart figure on a question', () => {
    const user = createUser(db, 'Alice');
    const [scienceCat] = categoryIdsFor('science');
    const [mathCat] = categoryIdsFor('math');

    const tableFigure: Figure = {
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
    };
    const chartFigure: Figure = {
      kind: 'bar',
      title: 'Dice Roll Frequency',
      xLabel: 'Roll',
      yLabel: 'Frequency',
      columns: [],
      rows: [],
      series: [{ label: 'Trials', points: [{ x: 1, y: 4 }, { x: 2, y: 7 }] }],
    };

    const attemptId = persistGeneratedTest(
      db,
      user.id,
      'science',
      [{ passageIndex: 0, passageType: 'Data Representation A', title: 'T', body: 'Body', figure: tableFigure }],
      [
        {
          questionIndex: 0,
          passageIndex: 0,
          categoryName: scienceCat.name,
          difficulty: 'easy',
          prompt: 'Q1',
          choices: ['a', 'b', 'c', 'd'],
          correctAnswerIndex: 0,
          explanation: 'x',
          figure: null, // passage-based questions never carry their own figure
        },
      ]
    );

    const mathAttemptId = persistGeneratedTest(
      db,
      user.id,
      'math',
      [],
      [
        {
          questionIndex: 0,
          passageIndex: null,
          categoryName: mathCat.name,
          difficulty: 'easy',
          prompt: 'Q1',
          choices: ['a', 'b', 'c', 'd'],
          correctAnswerIndex: 0,
          explanation: 'x',
          figure: chartFigure,
        },
      ]
    );

    const scienceDetail = getAttemptDetail(db, attemptId, { includeAnswers: true })!;
    expect(scienceDetail.passages[0].figure).toEqual(tableFigure);
    expect(scienceDetail.questions[0].figure).toBeNull();

    const mathDetail = getAttemptDetail(db, mathAttemptId, { includeAnswers: true })!;
    expect(mathDetail.questions[0].figure).toEqual(chartFigure);
  });

  it('stores null (not a stringified "none") when there is no figure', () => {
    const user = createUser(db, 'Alice');
    const [cat1] = categoryIdsFor('math');

    const attemptId = persistGeneratedTest(
      db,
      user.id,
      'math',
      [],
      [
        {
          questionIndex: 0,
          passageIndex: null,
          categoryName: cat1.name,
          difficulty: 'easy',
          prompt: 'Q1',
          choices: ['a', 'b', 'c', 'd'],
          correctAnswerIndex: 0,
          explanation: 'x',
          figure: null,
        },
      ]
    );

    const raw = db.prepare('SELECT figure FROM questions WHERE test_attempt_id = ?').get(attemptId) as {
      figure: string | null;
    };
    expect(raw.figure).toBeNull();

    const detail = getAttemptDetail(db, attemptId, { includeAnswers: true })!;
    expect(detail.questions[0].figure).toBeNull();
  });
});

describe('submitAttempt + getProgressSummary', () => {
  it('grades a test and reflects results in the dashboard summary', () => {
    const user = createUser(db, 'Alice');
    const [cat1, cat2] = categoryIdsFor('reading');

    const attemptId = persistGeneratedTest(
      db,
      user.id,
      'reading',
      [{ passageIndex: 0, passageType: 'Literary Narrative', title: 'T', body: 'Body', figure: null }],
      [
        {
          questionIndex: 0,
          passageIndex: 0,
          categoryName: cat1.name,
          difficulty: 'easy',
          prompt: 'Q1',
          choices: ['a', 'b', 'c', 'd'],
          correctAnswerIndex: 0,
          explanation: 'x',
          figure: null,
        },
        {
          questionIndex: 1,
          passageIndex: 0,
          categoryName: cat2.name,
          difficulty: 'easy',
          prompt: 'Q2',
          choices: ['a', 'b', 'c', 'd'],
          correctAnswerIndex: 0,
          explanation: 'x',
          figure: null,
        },
      ]
    );

    const detail = getAttemptDetail(db, attemptId, { includeAnswers: true })!;
    const [q1, q2] = detail.questions;
    const { scoreCorrect, scoreTotal } = submitAttempt(db, attemptId, [
      { questionId: q1.id, selectedAnswerIndex: 0 }, // correct
      { questionId: q2.id, selectedAnswerIndex: 3 }, // incorrect
    ]);
    expect(scoreCorrect).toBe(1);
    expect(scoreTotal).toBe(2);

    const attempts = listAttempts(db, user.id, 'reading');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe('completed');
    expect(attempts[0].scoreCorrect).toBe(1);

    const breakdown = getAttemptCategoryBreakdown(db, attemptId);
    const cat1Breakdown = breakdown.find((s) => s.categoryId === cat1.id)!;
    const cat2Breakdown = breakdown.find((s) => s.categoryId === cat2.id)!;
    expect(cat1Breakdown.attempts).toBe(1);
    expect(cat1Breakdown.correct).toBe(1);
    expect(cat2Breakdown.attempts).toBe(1);
    expect(cat2Breakdown.correct).toBe(0);

    const summary = getProgressSummary(db, user.id);
    const readingSummary = summary.find((s) => s.section === 'reading')!;
    expect(readingSummary.attemptCount).toBe(1);
    expect(readingSummary.averageScore).toBe(0.5);
    expect(readingSummary.weakestCategory).toBe(cat2.name);
  });
});
