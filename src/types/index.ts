export type Section = 'english' | 'math' | 'reading' | 'science';

export type Difficulty = 'easy' | 'medium' | 'hard';

export const SECTIONS: Section[] = ['english', 'math', 'reading', 'science'];

export const SECTION_LABELS: Record<Section, string> = {
  english: 'English',
  math: 'Math',
  reading: 'Reading',
  science: 'Science',
};

export interface CategoryDefinition {
  section: Section;
  groupName: string;
  name: string;
  sortOrder: number;
}

export interface User {
  id: number;
  name: string;
  createdAt: string;
}

export interface CategoryStat {
  categoryId: number;
  categoryName: string;
  groupName: string;
  attempts: number;
  correct: number;
}

export interface Passage {
  id: number;
  testAttemptId: number;
  passageIndex: number;
  passageType: string | null;
  title: string | null;
  body: string;
}

export interface Question {
  id: number;
  testAttemptId: number;
  passageId: number | null;
  categoryId: number;
  categoryName: string;
  questionIndex: number;
  prompt: string;
  choices: string[];
  correctAnswerIndex: number | null; // null when stripped for an in-progress attempt
  explanation: string | null; // null when stripped for an in-progress attempt
  difficulty: Difficulty | null;
}

export interface QuestionResponse {
  questionId: number;
  selectedAnswerIndex: number | null;
  isCorrect: boolean;
}

export interface TestAttempt {
  id: number;
  userId: number;
  section: Section;
  status: 'in_progress' | 'completed';
  numQuestions: number;
  scoreCorrect: number | null;
  scoreTotal: number | null;
  startedAt: string;
  completedAt: string | null;
}

export interface TestAttemptDetail extends TestAttempt {
  passages: Passage[];
  questions: Question[];
  responses: QuestionResponse[];
}

export interface SectionProgressSummary {
  section: Section;
  attemptCount: number;
  averageScore: number | null; // 0-1
  lastAttemptAt: string | null;
  weakestCategory: string | null;
}

export interface SubmitResponsePayload {
  questionId: number;
  selectedAnswerIndex: number | null;
}

// ---- Structured-output generation payload shapes (before persistence) ----

export interface GeneratedQuestion {
  index: number;
  category: string;
  difficulty: Difficulty;
  prompt: string;
  choices: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface GeneratedPassage {
  index: number;
  title: string;
  type: string;
  body: string;
  questions: GeneratedQuestion[];
}

export interface GeneratedPassageTest {
  passages: GeneratedPassage[];
}

export interface GeneratedMathTest {
  questions: GeneratedQuestion[];
}
