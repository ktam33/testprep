import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { getDb, getCategoryStats, persistGeneratedTest, PersistPassageInput, PersistQuestionInput } from '@/utils/db';
import { categoriesForSection } from '@/utils/categories';
import { allocateQuestions } from '@/utils/weighting';
import {
  SECTION_LAYOUTS,
  SCIENCE_ELIGIBILITY_MAP,
  assignCategoriesToPassages,
  buildFlatQuestionList,
  CategoryAllocation,
  CategoryToken,
  PassageAssignment,
} from '@/utils/passageLayout';
import { buildMathTestSchema, buildPassageTestSchema } from '@/utils/schemas';
import {
  Section,
  SECTION_LABELS,
  SECTIONS,
  GeneratedMathTest,
  GeneratedPassageTest,
  GeneratedQuestion,
} from '@/types';

// Generation can now take up to three model calls (generate, one retry, one review pass).
export const maxDuration = 180;

function tallyCategories(names: string[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const n of names) tally[n] = (tally[n] ?? 0) + 1;
  return tally;
}

function formatTally(names: string[]): string {
  return Object.entries(tallyCategories(names))
    .map(([name, count]) => `${count}x ${name}`)
    .join(', ');
}

function buildSystemMessage(section: Section): string {
  return `You are an expert item-writer creating official-style PreACT 9 Secure practice questions for the ${SECTION_LABELS[section]} section. Match real PreACT style, a 9th-grade reading level, and realistic difficulty. Every question must have exactly 4 answer choices with exactly one correct answer. Return only the structured JSON data requested — no extra commentary, no markdown.`;
}

function buildPassageUserMessage(section: Section, passages: PassageAssignment[]): string {
  const lengthGuidance =
    section === 'science'
      ? 'about 150-300 words describing an experiment, study, or dataset in prose (this is text-only, so describe any tables/graphs/figures in words rather than actually rendering a table)'
      : 'about 250-400 words';

  const totalQuestions = passages.reduce((sum, p) => sum + p.questionCount, 0);

  const passageInstructions = passages
    .map(
      (p) =>
        `Passage ${p.index} (type: "${p.type}"): write ${lengthGuidance}, followed by exactly ${p.questionCount} questions (question "index" 0-${p.questionCount - 1} within this passage). Suggested category mix for this passage's questions: ${formatTally(p.categoryNames)}.`
    )
    .join('\n');

  return `Generate a full ${SECTION_LABELS[section]} practice test with exactly ${passages.length} passages and ${totalQuestions} total questions.

${passageInstructions}

Aim for a difficulty mix across the whole test of roughly 30% easy, 40% medium, 30% hard.

For every question:
- Provide exactly 4 answer choices.
- correctAnswerIndex is 0-based (0-3).
- category must exactly match one of the category names listed above for that question's passage.
- explanation should be 1-2 sentences justifying the correct answer, written for a 9th-grade student.

Passage "index" fields must be 0-${passages.length - 1}, in the order listed above.`;
}

function buildMathUserMessage(flatList: CategoryToken[]): string {
  return `Generate a full Math practice test: exactly 30 standalone questions (no passages, no shared context between questions).

Required category distribution across the 30 questions: ${formatTally(flatList.map((t) => t.categoryName))}.

Aim for a difficulty mix of roughly 30% easy, 40% medium, 30% hard.

For every question:
- Provide exactly 4 answer choices (numeric or symbolic as appropriate).
- correctAnswerIndex is 0-based (0-3).
- category must exactly match one of the category names listed above.
- explanation should be 1-2 sentences justifying the correct answer, written for a 9th-grade student.
- index is the question's 0-based position in the overall 30-question test (0-29).`;
}

function buildReviewSystemMessage(section: Section): string {
  return `You are a meticulous PreACT 9 Secure item reviewer and editor for the ${SECTION_LABELS[section]} section. You will be given a complete generated practice test as JSON. Check every question for:

1. SENSE — is the question clear, unambiguous, grammatically correct, and properly answerable from its passage or given context (for Math, is it a well-posed and solvable problem)?
2. CORRECTNESS — is "correctAnswerIndex" actually the one correct answer, are the other three choices genuinely incorrect with no ties or other defensible answer, and does "explanation" accurately and correctly justify the correct answer?

If a question has any issue, fix it directly by rewriting its prompt, choices, correctAnswerIndex, and/or explanation so it becomes fully correct and well-formed. Keep its category, difficulty, and position (passage index / question index) unchanged — only the content may change. If a question already has no issues, return it completely unchanged. You may also lightly edit a passage's body if needed for one of its questions to make sense, but do not change passage type or ordering.

Return the complete revised test in the exact same JSON structure you were given: the same number of passages in the same order with the same number of questions each (or the same number of standalone questions for Math). Do not add, remove, or reorder anything, and do not add commentary — return only the structured data.`;
}

function buildReviewUserMessage(parsed: GeneratedMathTest | GeneratedPassageTest): string {
  return `Here is the generated test to review and correct where needed:\n\n${JSON.stringify(parsed)}`;
}

function isSection(value: unknown): value is Section {
  return typeof value === 'string' && (SECTIONS as string[]).includes(value);
}

type ValidationResult = { ok: true } | { ok: false; reason: string };

function validateGenerated(
  section: Section,
  parsed: GeneratedMathTest | GeneratedPassageTest,
  passageSkeleton: PassageAssignment[] | null
): ValidationResult {
  if (section === 'math') {
    const questions = (parsed as GeneratedMathTest).questions ?? [];
    if (questions.length !== 30) {
      return { ok: false, reason: `Expected exactly 30 questions total, got ${questions.length}. Generate exactly 30.` };
    }
    return { ok: true };
  }

  const passages = (parsed as GeneratedPassageTest).passages ?? [];
  if (!passageSkeleton) return { ok: false, reason: 'Internal error: missing passage skeleton' };
  if (passages.length !== passageSkeleton.length) {
    return {
      ok: false,
      reason: `Expected exactly ${passageSkeleton.length} passages, got ${passages.length}.`,
    };
  }
  for (let i = 0; i < passageSkeleton.length; i++) {
    const expected = passageSkeleton[i].questionCount;
    const actual = passages[i]?.questions?.length ?? 0;
    if (actual !== expected) {
      return {
        ok: false,
        reason: `Passage ${i} ("${passageSkeleton[i].type}") should have exactly ${expected} questions, got ${actual}. Regenerate with the exact counts specified for every passage.`,
      };
    }
  }
  const total = passages.reduce((sum, p) => sum + p.questions.length, 0);
  if (total !== 30) {
    return { ok: false, reason: `Expected 30 total questions across all passages, got ${total}.` };
  }
  return { ok: true };
}

function flattenGenerated(
  section: Section,
  parsed: GeneratedMathTest | GeneratedPassageTest
): { passages: PersistPassageInput[]; questions: PersistQuestionInput[] } {
  if (section === 'math') {
    const generated = parsed as GeneratedMathTest;
    const questions: PersistQuestionInput[] = generated.questions.map(
      (q: GeneratedQuestion, i: number) => ({
        questionIndex: i,
        passageIndex: null,
        categoryName: q.category,
        difficulty: q.difficulty,
        prompt: q.prompt,
        choices: q.choices,
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation,
      })
    );
    return { passages: [], questions };
  }

  const generated = parsed as GeneratedPassageTest;
  const passages: PersistPassageInput[] = generated.passages.map((p, i) => ({
    passageIndex: i,
    passageType: p.type,
    title: p.title,
    body: p.body,
  }));

  let runningIndex = 0;
  const questions: PersistQuestionInput[] = [];
  generated.passages.forEach((p, passageIdx) => {
    p.questions.forEach((q: GeneratedQuestion) => {
      questions.push({
        questionIndex: runningIndex++,
        passageIndex: passageIdx,
        categoryName: q.category,
        difficulty: q.difficulty,
        prompt: q.prompt,
        choices: q.choices,
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation,
      });
    });
  });

  return { passages, questions };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('🔵 [GENERATE API] Request received');

  try {
    const { section, userId } = await request.json();

    if (!isSection(section)) {
      return NextResponse.json({ error: 'A valid section is required' }, { status: 400 });
    }
    if (!userId || typeof userId !== 'number') {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ [GENERATE API] Missing OpenAI API key');
      return NextResponse.json({ error: 'OpenAI API key is not configured' }, { status: 500 });
    }

    const db = getDb();
    const categories = categoriesForSection(section);
    const categoryStats = getCategoryStats(db, userId, section);
    console.log(
      '🔵 [GENERATE API] Category stats:',
      categoryStats.map((s) => `${s.categoryName}: ${s.correct}/${s.attempts}`).join(', ')
    );

    const allocation = allocateQuestions(
      categoryStats.map((s) => ({ categoryId: s.categoryId, attempts: s.attempts, correct: s.correct })),
      30
    );
    const categoryAllocations: CategoryAllocation[] = categoryStats.map((s) => ({
      categoryId: s.categoryId,
      categoryName: s.categoryName,
      count: allocation.get(s.categoryId) ?? 1,
    }));
    console.log(
      '🔵 [GENERATE API] Target counts:',
      formatTally(categoryAllocations.flatMap((c) => Array(c.count).fill(c.categoryName)))
    );

    const categoryNames = categories.map((c) => c.name);
    const layout = SECTION_LAYOUTS[section];

    let passageSkeleton: PassageAssignment[] | null = null;
    let flatList: CategoryToken[] | null = null;

    if (layout.kind === 'passages') {
      const eligibilityMap = section === 'science' ? SCIENCE_ELIGIBILITY_MAP : undefined;
      passageSkeleton = assignCategoriesToPassages(categoryAllocations, layout.passages, eligibilityMap);
    } else {
      flatList = buildFlatQuestionList(categoryAllocations);
    }

    const schema =
      layout.kind === 'passages' ? buildPassageTestSchema(categoryNames) : buildMathTestSchema(categoryNames);

    const systemMessage = buildSystemMessage(section);
    const userMessage =
      layout.kind === 'passages' ? buildPassageUserMessage(section, passageSkeleton!) : buildMathUserMessage(flatList!);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90000 });

    async function callModel(extraReminder?: string) {
      const completion = await openai.beta.chat.completions.parse({
        model: process.env.OPENAI_MODEL ?? 'gpt-5.1',
        messages: [
          { role: 'system', content: systemMessage },
          {
            role: 'user',
            content: extraReminder ? `${userMessage}\n\nIMPORTANT CORRECTION: ${extraReminder}` : userMessage,
          },
        ],
        response_format: zodResponseFormat(schema, 'preact_test'),
        temperature: 0.7,
      });
      const parsed = completion.choices[0]?.message?.parsed;
      if (!parsed) throw new Error('No structured output returned from OpenAI');
      return parsed;
    }

    console.log('🔵 [GENERATE API] Calling OpenAI...');
    let parsed = await callModel();
    let validation = validateGenerated(section, parsed, passageSkeleton);

    if (!validation.ok) {
      console.log('⚠️ [GENERATE API] Validation failed, retrying once:', validation.reason);
      parsed = await callModel(validation.reason);
      validation = validateGenerated(section, parsed, passageSkeleton);
      if (!validation.ok) {
        throw new Error(`Generated test failed validation after retry: ${validation.reason}`);
      }
    }

    console.log('🔵 [GENERATE API] Running evaluation/revision pass...');
    try {
      const reviewCompletion = await openai.beta.chat.completions.parse({
        model: process.env.OPENAI_MODEL ?? 'gpt-5.1',
        messages: [
          { role: 'system', content: buildReviewSystemMessage(section) },
          { role: 'user', content: buildReviewUserMessage(parsed) },
        ],
        response_format: zodResponseFormat(schema, 'preact_test_review'),
        temperature: 0.2,
      });
      const reviewed = reviewCompletion.choices[0]?.message?.parsed;
      if (!reviewed) {
        console.log('⚠️ [GENERATE API] Evaluation pass returned no output, keeping pre-review test');
      } else {
        const reviewValidation = validateGenerated(section, reviewed, passageSkeleton);
        if (reviewValidation.ok) {
          parsed = reviewed;
          console.log('✅ [GENERATE API] Evaluation pass complete (revisions applied where needed)');
        } else {
          console.log(
            '⚠️ [GENERATE API] Evaluation pass broke test structure, keeping pre-review test:',
            reviewValidation.reason
          );
        }
      }
    } catch (reviewError: any) {
      // The review pass is a quality enhancement, not a hard requirement — a validated,
      // pre-review test is still fine to serve if this call fails for any reason.
      console.log('⚠️ [GENERATE API] Evaluation pass failed, keeping pre-review test:', reviewError.message);
    }

    const { passages, questions } = flattenGenerated(section, parsed);
    const attemptId = persistGeneratedTest(db, userId, section, passages, questions);

    const totalTime = Date.now() - startTime;
    console.log(`✅ [GENERATE API] Test generated and persisted in ${totalTime}ms (attemptId=${attemptId})`);

    return NextResponse.json({ attemptId });
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ [GENERATE API] Error after ${totalTime}ms:`, error.message);
    return NextResponse.json({ error: 'Failed to generate test: ' + error.message }, { status: 500 });
  }
}
