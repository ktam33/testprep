import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { Figure } from '@/types';
import {
  claimPregeneratedTest,
  countAvailablePregen,
  createDb,
  createUser,
  deleteAttempt,
  getAttemptCategoryBreakdown,
  getAttemptDetail,
  getCategoryStats,
  getProgressSummary,
  getTestAttempt,
  insertPregeneratedTest,
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
      [{ passageIndex: 0, passageType: 'English Passage', title: 'T', body: 'Body text.', segments: null, figure: null }],
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
      [{ passageIndex: 0, passageType: 'Data Representation A', title: 'T', body: 'Body', segments: null, figure: tableFigure }],
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

  it('round-trips English passage segments and leaves them null for other sections', () => {
    const user = createUser(db, 'Alice');
    const [englishCat] = categoryIdsFor('english');
    const segments = [
      { text: 'The team ', questionRef: -1 },
      { text: 'were winning', questionRef: 0 },
      { text: ' the game.', questionRef: -1 },
    ];

    const attemptId = persistGeneratedTest(
      db,
      user.id,
      'english',
      [{ passageIndex: 0, passageType: 'English Passage', title: 'T', body: 'The team were winning the game.', segments, figure: null }],
      [
        {
          questionIndex: 0,
          passageIndex: 0,
          categoryName: englishCat.name,
          difficulty: 'easy',
          prompt: '',
          choices: ['NO CHANGE', 'was winning', 'is winning', 'be winning'],
          correctAnswerIndex: 1,
          explanation: 'x',
          figure: null,
        },
      ]
    );

    const detail = getAttemptDetail(db, attemptId, { includeAnswers: true })!;
    expect(detail.passages[0].segments).toEqual(segments);

    const raw = db.prepare('SELECT segments FROM passages WHERE test_attempt_id = ?').get(attemptId) as {
      segments: string | null;
    };
    expect(typeof raw.segments).toBe('string'); // stored as JSON
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
      [{ passageIndex: 0, passageType: 'Literary Narrative', title: 'T', body: 'Body', segments: null, figure: null }],
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

describe('deleteAttempt', () => {
  function seedGradedMathAttempt(userId: number, categoryName: string, allCorrect: boolean) {
    const attemptId = persistGeneratedTest(
      db,
      userId,
      'math',
      [],
      [0, 1].map((i) => ({
        questionIndex: i,
        passageIndex: null,
        categoryName,
        difficulty: 'easy' as const,
        prompt: `Q${i}`,
        choices: ['a', 'b', 'c', 'd'],
        correctAnswerIndex: 0,
        explanation: 'x',
        figure: null,
      }))
    );
    const detail = getAttemptDetail(db, attemptId, { includeAnswers: true })!;
    submitAttempt(
      db,
      attemptId,
      detail.questions.map((q) => ({ questionId: q.id, selectedAnswerIndex: allCorrect ? 0 : 3 }))
    );
    return attemptId;
  }

  it('removes the attempt and its questions, passages and responses', () => {
    const user = createUser(db, 'Alice');
    const [cat1] = categoryIdsFor('math');
    const attemptId = seedGradedMathAttempt(user.id, cat1.name, true);

    expect(deleteAttempt(db, attemptId, user.id)).toBe(true);
    expect(getTestAttempt(db, attemptId)).toBeUndefined();

    const orphanQuestions = db
      .prepare('SELECT COUNT(*) AS n FROM questions WHERE test_attempt_id = ?')
      .get(attemptId) as { n: number };
    const orphanResponses = db
      .prepare('SELECT COUNT(*) AS n FROM responses WHERE question_id NOT IN (SELECT id FROM questions)')
      .get() as { n: number };
    expect(orphanQuestions.n).toBe(0);
    expect(orphanResponses.n).toBe(0);
  });

  it('excludes the deleted attempt from category stats and the dashboard summary', () => {
    const user = createUser(db, 'Alice');
    const [cat1] = categoryIdsFor('math');
    const keptId = seedGradedMathAttempt(user.id, cat1.name, true);
    const deletedId = seedGradedMathAttempt(user.id, cat1.name, false);

    const before = getCategoryStats(db, user.id, 'math').find((s) => s.categoryId === cat1.id)!;
    expect(before.attempts).toBe(4);
    expect(before.correct).toBe(2);
    expect(getProgressSummary(db, user.id).find((s) => s.section === 'math')!.averageScore).toBe(0.5);

    deleteAttempt(db, deletedId, user.id);

    // Stats now reflect only the kept attempt — the same numbers allocateQuestions()
    // reads when weighting the next generated test.
    const after = getCategoryStats(db, user.id, 'math').find((s) => s.categoryId === cat1.id)!;
    expect(after.attempts).toBe(2);
    expect(after.correct).toBe(2);

    const mathSummary = getProgressSummary(db, user.id).find((s) => s.section === 'math')!;
    expect(mathSummary.attemptCount).toBe(1);
    expect(mathSummary.averageScore).toBe(1);
    expect(listAttempts(db, user.id, 'math').map((a) => a.id)).toEqual([keptId]);
  });

  it('refuses to delete another user’s attempt', () => {
    const alice = createUser(db, 'Alice');
    const bob = createUser(db, 'Bob');
    const [cat1] = categoryIdsFor('math');
    const attemptId = seedGradedMathAttempt(alice.id, cat1.name, true);

    expect(deleteAttempt(db, attemptId, bob.id)).toBe(false);
    expect(getTestAttempt(db, attemptId)).toBeDefined();
    expect(getCategoryStats(db, alice.id, 'math').find((s) => s.categoryId === cat1.id)!.attempts).toBe(2);
  });

  it('returns false for an unknown attempt id', () => {
    const user = createUser(db, 'Alice');
    expect(deleteAttempt(db, 9999, user.id)).toBe(false);
  });

  it('cascades to the passages of a passage-based section', () => {
    const user = createUser(db, 'Alice');
    const [cat1] = categoryIdsFor('reading');
    const attemptId = persistGeneratedTest(
      db,
      user.id,
      'reading',
      [{ passageIndex: 0, passageType: 'Literary Narrative', title: 'T', body: 'Body', segments: null, figure: null }],
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
      ]
    );

    expect(deleteAttempt(db, attemptId, user.id)).toBe(true);
    const passages = db
      .prepare('SELECT COUNT(*) AS n FROM passages WHERE test_attempt_id = ?')
      .get(attemptId) as { n: number };
    expect(passages.n).toBe(0);
  });

  it('deletes an in-progress attempt that was never graded', () => {
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

    expect(deleteAttempt(db, attemptId, user.id)).toBe(true);
    expect(listAttempts(db, user.id, 'math')).toHaveLength(0);
  });
});

describe('pre-generation pool', () => {
  // A minimal one-question math test payload, shaped like GeneratedTestContent.
  function mathContent() {
    const [cat] = categoryIdsFor('math');
    return {
      passages: [],
      questions: [
        {
          questionIndex: 0,
          passageIndex: null,
          categoryName: cat.name,
          difficulty: 'easy',
          prompt: 'Q1',
          choices: ['a', 'b', 'c', 'd'],
          correctAnswerIndex: 0,
          explanation: 'x',
          figure: null,
        },
      ],
    };
  }

  it('counts a user\'s available pool tests per section, isolated between users', () => {
    const alice = createUser(db, 'Alice');
    const bob = createUser(db, 'Bob');
    insertPregeneratedTest(db, alice.id, 'math', JSON.stringify(mathContent()));
    insertPregeneratedTest(db, alice.id, 'math', JSON.stringify(mathContent()));
    insertPregeneratedTest(db, alice.id, 'english', JSON.stringify(mathContent()));
    insertPregeneratedTest(db, bob.id, 'science', JSON.stringify(mathContent()));

    const aliceCounts = countAvailablePregen(db, alice.id);
    expect(aliceCounts.math).toBe(2);
    expect(aliceCounts.english).toBe(1);
    expect(aliceCounts.science).toBe(0);

    const bobCounts = countAvailablePregen(db, bob.id);
    expect(bobCounts.math).toBe(0);
    expect(bobCounts.science).toBe(1);
  });

  it('claiming does not consume, but submitting the derived attempt does', () => {
    const user = createUser(db, 'Alice');
    insertPregeneratedTest(db, user.id, 'math', JSON.stringify(mathContent()));

    // Claim: the pool test is returned but stays available (unsubmitted = reusable).
    const claimed = claimPregeneratedTest(db, user.id, 'math')!;
    expect(claimed).not.toBeNull();
    expect(countAvailablePregen(db, user.id).math).toBe(1);

    // Deriving an attempt from it (still not submitted) leaves it available.
    const content = JSON.parse(claimed.content);
    const attemptId = persistGeneratedTest(db, user.id, 'math', content.passages, content.questions, claimed.id);
    expect(countAvailablePregen(db, user.id).math).toBe(1);
    expect(claimPregeneratedTest(db, user.id, 'math')!.id).toBe(claimed.id); // still claimable

    // Submitting the attempt consumes the source pool test for good.
    const q = getAttemptDetail(db, attemptId, { includeAnswers: true })!.questions[0];
    submitAttempt(db, attemptId, [{ questionId: q.id, selectedAnswerIndex: 0 }]);
    expect(countAvailablePregen(db, user.id).math).toBe(0);
    expect(claimPregeneratedTest(db, user.id, 'math')).toBeNull();
  });

  it('returns null when the pool for a user+section is empty', () => {
    const user = createUser(db, 'Alice');
    expect(claimPregeneratedTest(db, user.id, 'science')).toBeNull();
  });
});
