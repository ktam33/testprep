import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { CATEGORIES } from './categories';
import { gradeQuestions, GradableQuestion } from './grading';
import {
  CategoryStat,
  Difficulty,
  Figure,
  Passage,
  PassageSegment,
  Question,
  QuestionResponse,
  Section,
  SectionProgressSummary,
  SubmitResponsePayload,
  TestAttempt,
  TestAttemptDetail,
  User,
  SECTIONS,
} from '@/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  section     TEXT NOT NULL CHECK (section IN ('english','math','reading','science')),
  group_name  TEXT NOT NULL,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  UNIQUE (section, name)
);

CREATE TABLE IF NOT EXISTS test_attempts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section        TEXT NOT NULL CHECK (section IN ('english','math','reading','science')),
  status         TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  num_questions  INTEGER NOT NULL DEFAULT 30,
  score_correct  INTEGER,
  score_total    INTEGER,
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at   TEXT,
  topic_seeds    TEXT
);

CREATE TABLE IF NOT EXISTS passages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  test_attempt_id INTEGER NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
  passage_index   INTEGER NOT NULL,
  passage_type    TEXT,
  title           TEXT,
  body            TEXT NOT NULL,
  segments        TEXT,
  figure          TEXT
);

CREATE TABLE IF NOT EXISTS questions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  test_attempt_id       INTEGER NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
  passage_id            INTEGER REFERENCES passages(id) ON DELETE CASCADE,
  category_id           INTEGER NOT NULL REFERENCES categories(id),
  question_index        INTEGER NOT NULL,
  prompt                TEXT NOT NULL,
  choices               TEXT NOT NULL,
  correct_answer_index  INTEGER NOT NULL,
  explanation           TEXT NOT NULL,
  difficulty            TEXT CHECK (difficulty IN ('easy','medium','hard')),
  figure                TEXT
);

CREATE TABLE IF NOT EXISTS responses (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id            INTEGER NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
  selected_answer_index  INTEGER,
  is_correct             INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0,1)),
  answered_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-user pool of ready-made, adaptively-generated tests produced by the background
-- generator. "content" is the JSON { passages, questions } persist payload. A pool test
-- stays "available" (consumed = 0) until an attempt derived from it is actually submitted,
-- so an unsubmitted (abandoned) attempt leaves its source test reusable.
CREATE TABLE IF NOT EXISTS pregenerated_tests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section     TEXT NOT NULL CHECK (section IN ('english','math','reading','science')),
  content     TEXT NOT NULL,
  consumed    INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0,1)),
  topic_seeds TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_test_attempts_user  ON test_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_attempt   ON questions(test_attempt_id);
CREATE INDEX IF NOT EXISTS idx_questions_category  ON questions(category_id);
CREATE INDEX IF NOT EXISTS idx_passages_attempt    ON passages(test_attempt_id);
CREATE INDEX IF NOT EXISTS idx_pregenerated_avail  ON pregenerated_tests(user_id, section, consumed);
`;

function defaultDbPath(): string {
  return path.join(process.cwd(), 'data', 'preact-testprep.sqlite3');
}

// Handles existing on-disk databases created before a column existed —
// `CREATE TABLE IF NOT EXISTS` only affects brand-new databases.
function ensureColumn(db: Database.Database, table: string, column: string, ddlType: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType}`);
    console.log(`🟢 [DB] Migrated: added ${table}.${column}`);
  }
}

function seedCategories(db: Database.Database) {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
  if (count > 0) return;

  const insert = db.prepare(
    'INSERT INTO categories (section, group_name, name, sort_order) VALUES (?, ?, ?, ?)'
  );
  const insertMany = db.transaction((rows: typeof CATEGORIES) => {
    for (const c of rows) insert.run(c.section, c.groupName, c.name, c.sortOrder);
  });
  insertMany(CATEGORIES);
  console.log(`🟢 [DB] Seeded ${CATEGORIES.length} categories`);
}

export function createDb(filePath: string = defaultDbPath()): Database.Database {
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma('foreign_keys = ON');
  if (filePath !== ':memory:') db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  ensureColumn(db, 'passages', 'figure', 'TEXT');
  ensureColumn(db, 'passages', 'segments', 'TEXT');
  ensureColumn(db, 'questions', 'figure', 'TEXT');
  // Links an attempt back to the pool test it came from, so submitting the attempt can
  // mark that pool test consumed. Null for on-demand (non-pool) attempts.
  ensureColumn(db, 'test_attempts', 'pregenerated_id', 'INTEGER');
  // Pools became per-user; drop any legacy user-agnostic pool rows from before the migration.
  ensureColumn(db, 'pregenerated_tests', 'user_id', 'INTEGER');
  db.exec('DELETE FROM pregenerated_tests WHERE user_id IS NULL');
  // Subjects a test was seeded with, so later generations can avoid repeating them.
  ensureColumn(db, 'test_attempts', 'topic_seeds', 'TEXT');
  ensureColumn(db, 'pregenerated_tests', 'topic_seeds', 'TEXT');
  seedCategories(db);
  return db;
}

let singleton: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!singleton) {
    console.log('🟢 [DB] Initializing database...');
    singleton = createDb();
    console.log('✅ [DB] Database ready');
  }
  return singleton;
}

// ---------------------------------------------------------------------------
// Row -> domain object mapping
// ---------------------------------------------------------------------------

function mapUserRow(row: any): User {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

function mapAttemptRow(row: any): TestAttempt {
  return {
    id: row.id,
    userId: row.user_id,
    section: row.section,
    status: row.status,
    numQuestions: row.num_questions,
    scoreCorrect: row.score_correct,
    scoreTotal: row.score_total,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function mapPassageRow(row: any): Passage {
  return {
    id: row.id,
    testAttemptId: row.test_attempt_id,
    passageIndex: row.passage_index,
    passageType: row.passage_type,
    title: row.title,
    body: row.body,
    segments: row.segments ? JSON.parse(row.segments) : null,
    figure: row.figure ? JSON.parse(row.figure) : null,
  };
}

function mapQuestionRow(row: any, includeAnswers: boolean): Question {
  return {
    id: row.id,
    testAttemptId: row.test_attempt_id,
    passageId: row.passage_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    questionIndex: row.question_index,
    prompt: row.prompt,
    choices: JSON.parse(row.choices),
    correctAnswerIndex: includeAnswers ? row.correct_answer_index : null,
    explanation: includeAnswers ? row.explanation : null,
    difficulty: row.difficulty,
    figure: row.figure ? JSON.parse(row.figure) : null,
  };
}

function mapResponseRow(row: any): QuestionResponse {
  return {
    questionId: row.question_id,
    selectedAnswerIndex: row.selected_answer_index,
    isCorrect: !!row.is_correct,
  };
}

function mapCategoryStatRow(row: any): CategoryStat {
  return {
    categoryId: row.category_id,
    categoryName: row.category_name,
    groupName: row.group_name,
    attempts: row.attempts,
    correct: row.correct,
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function listUsers(db: Database.Database): User[] {
  return (db.prepare('SELECT id, name, created_at FROM users ORDER BY name').all() as any[]).map(mapUserRow);
}

export function getUser(db: Database.Database, id: number): User | undefined {
  const row = db.prepare('SELECT id, name, created_at FROM users WHERE id = ?').get(id);
  return row ? mapUserRow(row) : undefined;
}

export function createUser(db: Database.Database, name: string): User {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name is required');
  const info = db.prepare('INSERT INTO users (name) VALUES (?)').run(trimmed);
  return getUser(db, info.lastInsertRowid as number)!;
}

// ---------------------------------------------------------------------------
// Category stats (drives the adaptive weighting algorithm + progress pages)
// ---------------------------------------------------------------------------

export function getCategoryStats(db: Database.Database, userId: number, section: Section): CategoryStat[] {
  const rows = db
    .prepare(
      `SELECT c.id AS category_id, c.name AS category_name, c.group_name,
              COALESCE(a.attempts, 0) AS attempts, COALESCE(a.correct, 0) AS correct
       FROM categories c
       LEFT JOIN (
         SELECT q.category_id AS category_id, COUNT(r.id) AS attempts, SUM(r.is_correct) AS correct
         FROM questions q
         JOIN test_attempts ta ON ta.id = q.test_attempt_id AND ta.user_id = ? AND ta.status = 'completed'
         JOIN responses r ON r.question_id = q.id
         GROUP BY q.category_id
       ) a ON a.category_id = c.id
       WHERE c.section = ?
       ORDER BY c.sort_order`
    )
    .all(userId, section);
  return rows.map(mapCategoryStatRow);
}

export function getAttemptCategoryBreakdown(db: Database.Database, attemptId: number): CategoryStat[] {
  const rows = db
    .prepare(
      `SELECT c.id AS category_id, c.name AS category_name, c.group_name,
              COALESCE(a.attempts, 0) AS attempts, COALESCE(a.correct, 0) AS correct
       FROM categories c
       LEFT JOIN (
         SELECT q.category_id AS category_id, COUNT(r.id) AS attempts, SUM(r.is_correct) AS correct
         FROM questions q
         JOIN responses r ON r.question_id = q.id
         WHERE q.test_attempt_id = ?
         GROUP BY q.category_id
       ) a ON a.category_id = c.id
       WHERE c.section = (SELECT section FROM test_attempts WHERE id = ?)
       ORDER BY c.sort_order`
    )
    .all(attemptId, attemptId);
  return rows.map(mapCategoryStatRow);
}

// ---------------------------------------------------------------------------
// Test generation persistence
// ---------------------------------------------------------------------------

export interface PersistPassageInput {
  passageIndex: number;
  passageType: string;
  title: string;
  body: string;
  segments: PassageSegment[] | null;
  figure: Figure | null;
}

export interface PersistQuestionInput {
  questionIndex: number;
  passageIndex: number | null; // references PersistPassageInput.passageIndex, or null for Math
  categoryName: string;
  difficulty: Difficulty;
  prompt: string;
  choices: string[];
  correctAnswerIndex: number;
  explanation: string;
  figure: Figure | null;
}

export function persistGeneratedTest(
  db: Database.Database,
  userId: number,
  section: Section,
  passages: PersistPassageInput[],
  questions: PersistQuestionInput[],
  pregeneratedId: number | null = null,
  topicLabels: string[] = []
): number {
  const categoryIdByName = new Map<string, number>(
    (db.prepare('SELECT id, name FROM categories WHERE section = ?').all(section) as any[]).map((r) => [
      r.name,
      r.id,
    ])
  );

  const insertAttempt = db.prepare(
    'INSERT INTO test_attempts (user_id, section, num_questions, pregenerated_id, topic_seeds) VALUES (?, ?, ?, ?, ?)'
  );
  const insertPassage = db.prepare(
    'INSERT INTO passages (test_attempt_id, passage_index, passage_type, title, body, segments, figure) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertQuestion = db.prepare(
    `INSERT INTO questions
      (test_attempt_id, passage_id, category_id, question_index, prompt, choices, correct_answer_index, explanation, difficulty, figure)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const run = db.transaction(() => {
    const attemptId = insertAttempt.run(
      userId,
      section,
      questions.length,
      pregeneratedId,
      topicLabels.length > 0 ? JSON.stringify(topicLabels) : null
    ).lastInsertRowid as number;

    const passageIdByIndex = new Map<number, number>();
    for (const p of passages) {
      const passageId = insertPassage.run(
        attemptId,
        p.passageIndex,
        p.passageType,
        p.title,
        p.body,
        p.segments ? JSON.stringify(p.segments) : null,
        p.figure ? JSON.stringify(p.figure) : null
      ).lastInsertRowid as number;
      passageIdByIndex.set(p.passageIndex, passageId);
    }

    for (const q of questions) {
      const categoryId = categoryIdByName.get(q.categoryName);
      if (!categoryId) {
        throw new Error(`Unknown category "${q.categoryName}" for section "${section}"`);
      }
      const passageId = q.passageIndex !== null ? passageIdByIndex.get(q.passageIndex) ?? null : null;
      insertQuestion.run(
        attemptId,
        passageId,
        categoryId,
        q.questionIndex,
        q.prompt,
        JSON.stringify(q.choices),
        q.correctAnswerIndex,
        q.explanation,
        q.difficulty,
        q.figure ? JSON.stringify(q.figure) : null
      );
    }

    return attemptId;
  });

  return run();
}

// ---------------------------------------------------------------------------
// Pre-generation pool (per user)
// ---------------------------------------------------------------------------

export function insertPregeneratedTest(
  db: Database.Database,
  userId: number,
  section: Section,
  content: string,
  topicLabels: string[] = []
): number {
  return db
    .prepare('INSERT INTO pregenerated_tests (user_id, section, content, topic_seeds) VALUES (?, ?, ?, ?)')
    .run(userId, section, content, topicLabels.length > 0 ? JSON.stringify(topicLabels) : null)
    .lastInsertRowid as number;
}

// Available (unconsumed) pool tests per section, for a single user.
export function countAvailablePregen(db: Database.Database, userId: number): Record<Section, number> {
  const rows = db
    .prepare('SELECT section, COUNT(*) AS n FROM pregenerated_tests WHERE user_id = ? AND consumed = 0 GROUP BY section')
    .all(userId) as { section: Section; n: number }[];
  const counts = Object.fromEntries(SECTIONS.map((s) => [s, 0])) as Record<Section, number>;
  for (const r of rows) counts[r.section] = r.n;
  return counts;
}

// Returns the oldest available pool test for a user+section without consuming it (it is only
// consumed once an attempt derived from it is submitted). Null if that pool is empty.
export function claimPregeneratedTest(
  db: Database.Database,
  userId: number,
  section: Section
): { id: number; content: string } | null {
  const row = db
    .prepare('SELECT id, content FROM pregenerated_tests WHERE user_id = ? AND section = ? AND consumed = 0 ORDER BY id LIMIT 1')
    .get(userId, section) as { id: number; content: string } | undefined;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Topic history (feeds the generator's avoid-list)
// ---------------------------------------------------------------------------

function parseTopicSeedRows(rows: { topic_seeds: string }[]): string[] {
  const labels: string[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.topic_seeds);
      if (Array.isArray(parsed)) labels.push(...parsed.filter((x): x is string => typeof x === 'string'));
    } catch {
      // A malformed row just means one fewer topic to avoid — never worth failing generation.
    }
  }
  return labels;
}

/**
 * Subjects to steer a new test away from: those used by the user's recent attempts, plus
 * those sitting in their unconsumed pool.
 *
 * The pool half matters as much as the history half. The background fill loop generates
 * several tests back-to-back, and each one reads this list before generating — without the
 * pool entries here, two pool tests made a minute apart would avoid the same past subjects
 * but happily duplicate each other.
 */
export function getRecentTopicSeeds(
  db: Database.Database,
  userId: number,
  section: Section,
  attemptLimit = 6
): string[] {
  const attemptRows = db
    .prepare(
      `SELECT topic_seeds FROM test_attempts
       WHERE user_id = ? AND section = ? AND topic_seeds IS NOT NULL
       ORDER BY id DESC LIMIT ?`
    )
    .all(userId, section, attemptLimit) as { topic_seeds: string }[];

  const poolRows = db
    .prepare(
      `SELECT topic_seeds FROM pregenerated_tests
       WHERE user_id = ? AND section = ? AND consumed = 0 AND topic_seeds IS NOT NULL`
    )
    .all(userId, section) as { topic_seeds: string }[];

  return [...new Set([...parseTopicSeedRows(poolRows), ...parseTopicSeedRows(attemptRows)])];
}

// ---------------------------------------------------------------------------
// Reading a test attempt
// ---------------------------------------------------------------------------

export function getTestAttempt(db: Database.Database, attemptId: number): TestAttempt | undefined {
  const row = db.prepare('SELECT * FROM test_attempts WHERE id = ?').get(attemptId);
  return row ? mapAttemptRow(row) : undefined;
}

export function getAttemptDetail(
  db: Database.Database,
  attemptId: number,
  opts: { includeAnswers: boolean }
): TestAttemptDetail | undefined {
  const attempt = getTestAttempt(db, attemptId);
  if (!attempt) return undefined;

  const passageRows = db
    .prepare('SELECT * FROM passages WHERE test_attempt_id = ? ORDER BY passage_index')
    .all(attemptId);
  const questionRows = db
    .prepare(
      `SELECT q.*, c.name AS category_name
       FROM questions q
       JOIN categories c ON c.id = q.category_id
       WHERE q.test_attempt_id = ?
       ORDER BY q.question_index`
    )
    .all(attemptId);
  const responseRows = db
    .prepare(
      `SELECT r.* FROM responses r
       JOIN questions q ON q.id = r.question_id
       WHERE q.test_attempt_id = ?`
    )
    .all(attemptId);

  return {
    ...attempt,
    passages: passageRows.map(mapPassageRow),
    questions: questionRows.map((row) => mapQuestionRow(row, opts.includeAnswers)),
    responses: responseRows.map(mapResponseRow),
  };
}

export function listAttempts(db: Database.Database, userId: number, section: Section): TestAttempt[] {
  return (
    db
      .prepare('SELECT * FROM test_attempts WHERE user_id = ? AND section = ? ORDER BY started_at DESC')
      .all(userId, section) as any[]
  ).map(mapAttemptRow);
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export function submitAttempt(
  db: Database.Database,
  attemptId: number,
  responses: SubmitResponsePayload[]
): { scoreCorrect: number; scoreTotal: number } {
  const questionRows = db
    .prepare('SELECT id, correct_answer_index FROM questions WHERE test_attempt_id = ?')
    .all(attemptId) as { id: number; correct_answer_index: number }[];

  const gradable: GradableQuestion[] = questionRows.map((r) => ({
    id: r.id,
    correctAnswerIndex: r.correct_answer_index,
  }));
  const { results, scoreCorrect, scoreTotal } = gradeQuestions(gradable, responses);

  const insertResponse = db.prepare(
    'INSERT INTO responses (question_id, selected_answer_index, is_correct) VALUES (?, ?, ?)'
  );
  const updateAttempt = db.prepare(
    `UPDATE test_attempts SET status = 'completed', score_correct = ?, score_total = ?, completed_at = datetime('now') WHERE id = ?`
  );

  const run = db.transaction(() => {
    for (const r of results) {
      insertResponse.run(r.questionId, r.selectedAnswerIndex, r.isCorrect ? 1 : 0);
    }
    updateAttempt.run(scoreCorrect, scoreTotal, attemptId);

    // If this attempt came from the pre-generation pool, submitting it consumes the source
    // test for good (an unsubmitted/abandoned attempt would have left it reusable).
    const row = db.prepare('SELECT pregenerated_id FROM test_attempts WHERE id = ?').get(attemptId) as
      | { pregenerated_id: number | null }
      | undefined;
    if (row?.pregenerated_id != null) {
      db.prepare('UPDATE pregenerated_tests SET consumed = 1 WHERE id = ?').run(row.pregenerated_id);
    }
  });
  run();

  return { scoreCorrect, scoreTotal };
}

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------

function getSectionSummary(db: Database.Database, userId: number, section: Section): SectionProgressSummary {
  const attempts = db
    .prepare(
      `SELECT score_correct, score_total, completed_at
       FROM test_attempts
       WHERE user_id = ? AND section = ? AND status = 'completed'
       ORDER BY completed_at DESC`
    )
    .all(userId, section) as { score_correct: number; score_total: number; completed_at: string }[];

  const attemptCount = attempts.length;
  let averageScore: number | null = null;
  if (attemptCount > 0) {
    const totalCorrect = attempts.reduce((sum, a) => sum + (a.score_correct ?? 0), 0);
    const totalQuestions = attempts.reduce((sum, a) => sum + (a.score_total ?? 0), 0);
    averageScore = totalQuestions > 0 ? totalCorrect / totalQuestions : null;
  }
  const lastAttemptAt = attemptCount > 0 ? attempts[0].completed_at : null;

  const stats = getCategoryStats(db, userId, section).filter((s) => s.attempts > 0);
  let weakestCategory: string | null = null;
  if (stats.length > 0) {
    stats.sort((a, b) => a.correct / a.attempts - b.correct / b.attempts);
    weakestCategory = stats[0].categoryName;
  }

  return { section, attemptCount, averageScore, lastAttemptAt, weakestCategory };
}

export function getProgressSummary(db: Database.Database, userId: number): SectionProgressSummary[] {
  return SECTIONS.map((section) => getSectionSummary(db, userId, section));
}
