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
import { validateFigure } from '@/utils/figureValidation';
import {
  Section,
  SECTION_LABELS,
  SECTIONS,
  Figure,
  GeneratedMathTest,
  GeneratedPassage,
  GeneratedPassageTest,
  GeneratedQuestion,
} from '@/types';

// Science categories that are meaningless without an actual table/graph to look at.
const DATA_INTERPRETATION_CATEGORIES = new Set(['Tables', 'Graphs', 'Trends & Data Comparison']);

// Generation can take up to three model calls (generate, one retry, one review pass).
export const maxDuration = 300;

// Reasoning effort for the gpt-5.x models. Item-writing is a structured task that does
// not need deep reasoning, and lower effort is the single biggest per-call latency lever.
// Override with OPENAI_REASONING_EFFORT if a model/task needs more.
const REASONING_EFFORT = (process.env.OPENAI_REASONING_EFFORT ?? 'low') as 'low' | 'medium' | 'high';

// Soft wall-clock budget: the optional review pass is skipped (or given a shrunken
// timeout) once this much of the request has already elapsed, so it can never push the
// whole request past maxDuration.
const REVIEW_SOFT_DEADLINE_MS = 150_000;
const MIN_REVIEW_MS = 25_000;

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
  const lengthGuidance = section === 'science' ? 'about 150-300 words' : 'about 250-400 words';

  const totalQuestions = passages.reduce((sum, p) => sum + p.questionCount, 0);

  const passageInstructions = passages
    .map(
      (p) =>
        `Passage ${p.index} (type: "${p.type}"): write ${lengthGuidance}, followed by exactly ${p.questionCount} questions (question "index" 0-${p.questionCount - 1} within this passage). Suggested category mix for this passage's questions: ${formatTally(p.categoryNames)}.`
    )
    .join('\n');

  const figureGuidance =
    section === 'science'
      ? `
Each passage has a "figure" field. For any passage whose questions include Tables, Graphs, or Trends & Data Comparison (especially "Data Representation" passages), set "figure" to a real table (kind: "table", with columns/rows of concrete data) or chart (kind: "bar"/"line"/"scatter", with 1-3 series of concrete x/y points) — do not just describe numbers in the passage body prose, reference the figure instead ("the table below shows...", "as shown in the graph..."). Keep charts to a small number of points/categories (roughly 4-8) so they stay legible. "Research Summary" and "Conflicting Viewpoints" passages may also include a table if it strengthens the item. For any passage with no figure, set "figure" to exactly { "kind": "none", "title": "", "xLabel": "", "yLabel": "", "columns": [], "rows": [], "series": [] }.
`
      : '';

  const englishGuidance =
    section === 'english'
      ? `
This is the ACT/PreACT English format, NOT a reading-comprehension format. Each passage is written as an ordered "segments" array whose "text" values, concatenated in order, form the full passage. Set "body" to that same full concatenated text as well.

Two kinds of segment:
- Plain prose: set "questionRef" to -1.
- An UNDERLINED PORTION governed by a question: set "questionRef" to the 0-based "index" of that question within THIS passage's questions array. Each underlined portion points to exactly one question, and no two point to the same question.

For each passage, make MOST questions (at least 4 of the ${passages[0]?.questionCount ?? 6}) underlined-portion questions, and the rest whole-passage rhetorical questions:

UNDERLINED-PORTION questions (use for Grammar & Usage, Punctuation, and Sentence Structure categories):
- The underlined segment's "text" is exactly the words the student is evaluating — it lives in the passage and is shown underlined. The question stem is the underline itself, so set that question's "prompt" to "" (empty string), unless the item asks something specific like conciseness or word choice, in which case a short stem such as "Which choice is most concise?" is fine.
- choices[0] MUST be exactly the string "NO CHANGE". choices[1], choices[2], choices[3] are alternative wordings that would REPLACE the underlined segment's text.
- Decide deliberately: either the underlined text is already correct (then correctAnswerIndex = 0, "NO CHANGE") OR it contains a genuine error of that question's category. If it contains an error, the error MUST be physically present in the segment's "text" in the passage — never put an error only in a choice or only in the question. The correct choice (1-3) is the properly fixed wording; the other choices are plausible but wrong. About 1/3 to 1/2 of underlined items should be "NO CHANGE"-correct.

WHOLE-PASSAGE / RHETORICAL questions (use for Rhetorical Skills categories — Organization & Paragraph Structure, Main Idea & Supporting Details, Style, Tone & Conciseness, Purpose & Audience): these are NOT tied to a segment (no segment's questionRef points at them). Put the complete question in "prompt" and give 4 normal answer choices (no "NO CHANGE").

Every question's "category" still must match one listed for its passage. Keep the passage coherent, 9th-grade-level prose.
`
      : '';

  return `Generate a full ${SECTION_LABELS[section]} practice test with exactly ${passages.length} passages and ${totalQuestions} total questions.

${passageInstructions}

Aim for a difficulty mix across the whole test of roughly 30% easy, 40% medium, 30% hard.

For every question:
- Provide exactly 4 answer choices.
- correctAnswerIndex is 0-based (0-3).
- category must exactly match one of the category names listed above for that question's passage.
- explanation should be 1-2 sentences justifying the correct answer, written for a 9th-grade student.
${figureGuidance}${englishGuidance}
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
- index is the question's 0-based position in the overall 30-question test (0-29).
- Write every mathematical expression as LaTeX wrapped in \\( ... \\) delimiters — in the prompt, in EACH of the four answer choices, and in the explanation. For example an answer choice must be "\\(\\dfrac{11}{12}\\)", never a bare "\\dfrac{11}{12}" or "11/12". Plain non-mathematical words stay outside the delimiters.
- Every question has a "figure" field. For Statistics & Probability, Coordinate Plane & Graphing, and Slope & Linear Relationships questions, often (not always) give it a real table (kind: "table") or chart (kind: "bar"/"line"/"scatter", with concrete x/y points, roughly 4-8 points for legibility) that the question actually depends on. For all other questions, and for any of those categories where a figure isn't a natural fit, set "figure" to exactly { "kind": "none", "title": "", "xLabel": "", "yLabel": "", "columns": [], "rows": [], "series": [] }.`;
}

function buildReviewSystemMessage(section: Section): string {
  return `You are a meticulous PreACT 9 Secure item reviewer and editor for the ${SECTION_LABELS[section]} section. You will be given a complete generated practice test as JSON. Check every question for:

1. SENSE — is the question clear, unambiguous, grammatically correct, and properly answerable from its passage or given context (for Math, is it a well-posed and solvable problem)?
2. CORRECTNESS — is "correctAnswerIndex" actually the one correct answer, are the other three choices genuinely incorrect with no ties or other defensible answer, and does "explanation" accurately and correctly justify the correct answer?

If a question has any issue, fix it directly by rewriting its prompt, choices, correctAnswerIndex, and/or explanation so it becomes fully correct and well-formed. Keep its category, difficulty, and position (passage index / question index) unchanged — only the content may change. If a question already has no issues, return it completely unchanged. You may also lightly edit a passage's body if needed for one of its questions to make sense, but do not change passage type or ordering.
${
  section === 'english'
    ? `
This English test uses the ACT/PreACT underlined-portion format. Each passage has a "segments" array; segments with questionRef = -1 are plain prose, and a segment whose questionRef is a question's index is that question's UNDERLINED PORTION. For an underlined-portion question, choices[0] is always exactly "NO CHANGE", choices[1-3] are replacement wordings for that segment's text, and correctAnswerIndex = 0 means the underlined text is already correct. When you check such a question, evaluate the actual segment "text" in the passage — any grammatical error being tested must be present in that segment text, not only implied by the choices. If you fix an underlined portion, you may edit the segment's "text" and that question's choices/answer together so they stay consistent, but do NOT change the segments array's length, order, or any questionRef values, and keep body equal to the segment texts concatenated in order. Leave whole-passage rhetorical questions (no segment points to them) in their normal prompt+choices form.
`
    : ''
}
Return the complete revised test in the exact same JSON structure you were given: the same number of passages in the same order with the same number of questions each (or the same number of standalone questions for Math). Do not add, remove, or reorder anything, and do not add commentary — return only the structured data.`;
}

function buildReviewUserMessage(parsed: GeneratedMathTest | GeneratedPassageTest): string {
  return `Here is the generated test to review and correct where needed:\n\n${JSON.stringify(parsed)}`;
}

function isSection(value: unknown): value is Section {
  return typeof value === 'string' && (SECTIONS as string[]).includes(value);
}

type ValidationResult = { ok: true } | { ok: false; reason: string };

type PassageExpectation = { index: number; type: string; questionCount: number };

// English question categories that test a specific span of text and therefore MUST be
// underlined-portion questions tied to a segment. Rhetorical Skills questions may stand alone.
const ENGLISH_UNDERLINE_CATEGORIES = new Set(
  categoriesForSection('english')
    .filter((c) => c.groupName !== 'Rhetorical Skills')
    .map((c) => c.name)
);

// Validates a single generated passage against what the skeleton expected of it. Shared by
// the whole-test validator and the per-passage parallel generation path.
function validatePassage(section: Section, p: GeneratedPassage, expected: PassageExpectation): ValidationResult {
  const actual = p.questions?.length ?? 0;
  if (actual !== expected.questionCount) {
    return {
      ok: false,
      reason: `Passage ${expected.index} ("${expected.type}") should have exactly ${expected.questionCount} questions, got ${actual}. Regenerate with the exact question count.`,
    };
  }

  if (section === 'science') {
    if (p.figure) {
      const figureCheck = validateFigure(p.figure);
      if (!figureCheck.ok) return { ok: false, reason: `Passage ${expected.index}: ${figureCheck.reason}` };
    }
    const needsFigure = p.questions.some((q) => DATA_INTERPRETATION_CATEGORIES.has(q.category));
    if (needsFigure && (!p.figure || p.figure.kind === 'none')) {
      return {
        ok: false,
        reason: `Passage ${expected.index} ("${expected.type}") has a Tables/Graphs/Trends & Data Comparison question but figure.kind is "none". Give it a real "table" or chart figure with concrete data.`,
      };
    }
  }

  if (section === 'english') {
    const segments = p.segments ?? [];
    if (segments.length === 0) {
      return { ok: false, reason: `Passage ${expected.index} has no "segments"; write the passage body as an ordered segments array.` };
    }
    if (segments.every((s) => !s.text.trim())) {
      return { ok: false, reason: `Passage ${expected.index} segments contain no text.` };
    }

    const referenced = new Set<number>();
    for (const r of segments.map((s) => s.questionRef).filter((r) => r !== -1)) {
      if (!Number.isInteger(r) || r < 0 || r >= p.questions.length) {
        return { ok: false, reason: `Passage ${expected.index} has a segment questionRef ${r} that is not a valid question index (0-${p.questions.length - 1}) or -1.` };
      }
      if (referenced.has(r)) {
        return { ok: false, reason: `Passage ${expected.index} has two segments pointing to question ${r}; each underlined portion must reference a distinct question.` };
      }
      referenced.add(r);
    }

    for (let qi = 0; qi < p.questions.length; qi++) {
      const q = p.questions[qi];
      const isUnderline = referenced.has(qi);
      // Grammar/punctuation/sentence-structure items must live in an underlined span (that
      // is what killed the fabricated-excerpt bug). We deliberately do NOT require
      // choices[0] to read "NO CHANGE" — that is normalized at persist time — so the model
      // isn't spuriously rejected for wording the first choice as the original text.
      if (ENGLISH_UNDERLINE_CATEGORIES.has(q.category) && !isUnderline) {
        return { ok: false, reason: `Passage ${expected.index} question ${qi} ("${q.category}") must be an underlined-portion question: add a segment whose questionRef is ${qi}.` };
      }
      if (!isUnderline && !q.prompt.trim()) {
        return { ok: false, reason: `Passage ${expected.index} question ${qi} is a whole-passage question, so "prompt" must contain the full question text.` };
      }
    }
  }

  return { ok: true };
}

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
    for (const q of questions) {
      if (q.figure) {
        const figureCheck = validateFigure(q.figure);
        if (!figureCheck.ok) {
          return { ok: false, reason: `Question ${q.index}: ${figureCheck.reason}` };
        }
      }
    }
    return { ok: true };
  }

  const passages = (parsed as GeneratedPassageTest).passages ?? [];
  if (!passageSkeleton) return { ok: false, reason: 'Internal error: missing passage skeleton' };
  if (passages.length !== passageSkeleton.length) {
    return { ok: false, reason: `Expected exactly ${passageSkeleton.length} passages, got ${passages.length}.` };
  }
  for (let i = 0; i < passageSkeleton.length; i++) {
    const res = validatePassage(section, passages[i], {
      index: i,
      type: passageSkeleton[i].type,
      questionCount: passageSkeleton[i].questionCount,
    });
    if (!res.ok) return res;
  }
  const total = passages.reduce((sum, p) => sum + p.questions.length, 0);
  if (total !== 30) {
    return { ok: false, reason: `Expected 30 total questions across all passages, got ${total}.` };
  }

  return { ok: true };
}

function collapseFigure(figure: Figure | undefined): Figure | null {
  return !figure || figure.kind === 'none' ? null : figure;
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
        figure: collapseFigure(q.figure),
      })
    );
    return { passages: [], questions };
  }

  const generated = parsed as GeneratedPassageTest;
  const passages: PersistPassageInput[] = generated.passages.map((p, i) => {
    const segments = section === 'english' ? p.segments ?? null : null;
    // For English, the passage body is the segment runs concatenated in order; fall back
    // to the model's own body if segments are somehow absent.
    const body = segments && segments.length > 0 ? segments.map((s) => s.text).join('') : p.body;
    return {
      passageIndex: i,
      passageType: p.type,
      title: p.title,
      body,
      segments,
      figure: collapseFigure(p.figure),
    };
  });

  let runningIndex = 0;
  const questions: PersistQuestionInput[] = [];
  generated.passages.forEach((p, passageIdx) => {
    // For English, the underlined-portion questions (those a segment points at) get choice A
    // normalized to the literal "NO CHANGE" — slot 0 is the "keep the underlined text" option
    // by construction, so this gives consistent ACT-style display regardless of how the model
    // worded it, without altering correctAnswerIndex semantics.
    const underlined =
      section === 'english'
        ? new Set((p.segments ?? []).map((s) => s.questionRef).filter((r) => r !== -1))
        : new Set<number>();
    p.questions.forEach((q: GeneratedQuestion, qi: number) => {
      const choices = underlined.has(qi) ? ['NO CHANGE', ...q.choices.slice(1)] : q.choices;
      questions.push({
        questionIndex: runningIndex++,
        passageIndex: passageIdx,
        categoryName: q.category,
        difficulty: q.difficulty,
        prompt: q.prompt,
        choices,
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation,
        figure: null, // passage-based questions never carry their own figure — it lives on the passage
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
      layout.kind === 'passages'
        ? buildPassageTestSchema(categoryNames, {
            passagesHaveFigure: section === 'science',
            passagesHaveSegments: section === 'english',
          })
        : buildMathTestSchema(categoryNames);

    const systemMessage = buildSystemMessage(section);

    // maxRetries: 0 — the SDK otherwise retries a timed-out call up to twice, which can
    // silently turn one stall into a multi-minute blow-up of the request budget. We handle
    // the single meaningful retry (on validation failure) explicitly below.
    //
    // timeout is per model call. gpt-5.x reasoning latency for one passage sits near ~85s,
    // so a 90s cap leaves no margin; since passages are generated in parallel, a higher cap
    // does not raise wall-clock time — it just keeps a passage near the floor from failing.
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 150000, maxRetries: 0 });

    async function runCompletion(userContent: string) {
      const completion = await openai.beta.chat.completions.parse({
        model: process.env.OPENAI_MODEL ?? 'gpt-5.1',
        reasoning_effort: REASONING_EFFORT,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userContent },
        ],
        response_format: zodResponseFormat(schema, 'preact_test'),
      });
      const parsed = completion.choices[0]?.message?.parsed;
      if (!parsed) throw new Error('No structured output returned from OpenAI');
      return parsed;
    }

    // Generates one passage (with its questions) in its own call, retrying once on a
    // validation failure. Passages are produced this way in parallel: a single call for all
    // five passages exceeds the per-call timeout for English, so splitting into several small
    // concurrent calls makes total wall time roughly the slowest single passage.
    async function generateOnePassage(pa: PassageAssignment): Promise<GeneratedPassage> {
      // Reuse the passage prompt for a single passage rendered at index 0; assembly below
      // re-derives the real passage index, so the model's own index field is irrelevant.
      const message = buildPassageUserMessage(section, [{ ...pa, index: 0 }]);
      const expected: PassageExpectation = { index: pa.index, type: pa.type, questionCount: pa.questionCount };
      const extract = (p: GeneratedMathTest | GeneratedPassageTest): GeneratedPassage => {
        const list = (p as GeneratedPassageTest).passages ?? [];
        if (list.length === 0) throw new Error(`Passage ${pa.index}: model returned no passage`);
        return list[0] as GeneratedPassage;
      };

      let passage = extract(await runCompletion(message));
      let res = validatePassage(section, passage, expected);
      if (!res.ok) {
        console.log(`⚠️ [GENERATE API] Passage ${pa.index} validation failed, retrying once:`, res.reason);
        passage = extract(await runCompletion(`${message}\n\nIMPORTANT CORRECTION: ${res.reason}`));
        res = validatePassage(section, passage, expected);
        if (!res.ok) throw new Error(`Passage ${pa.index} failed validation after retry: ${res.reason}`);
      }
      return passage;
    }

    let parsed: GeneratedMathTest | GeneratedPassageTest;

    if (layout.kind === 'passages') {
      console.log(`🔵 [GENERATE API] Generating ${passageSkeleton!.length} passages in parallel...`);
      const generatedPassages = await Promise.all(passageSkeleton!.map((pa) => generateOnePassage(pa)));
      parsed = { passages: generatedPassages };
      const validation = validateGenerated(section, parsed, passageSkeleton);
      if (!validation.ok) throw new Error(`Generated test failed validation: ${validation.reason}`);
    } else {
      console.log('🔵 [GENERATE API] Calling OpenAI (Math)...');
      const mathMessage = buildMathUserMessage(flatList!);
      parsed = await runCompletion(mathMessage);
      let validation = validateGenerated(section, parsed, passageSkeleton);
      if (!validation.ok) {
        console.log('⚠️ [GENERATE API] Validation failed, retrying once:', validation.reason);
        parsed = await runCompletion(`${mathMessage}\n\nIMPORTANT CORRECTION: ${validation.reason}`);
        validation = validateGenerated(section, parsed, passageSkeleton);
        if (!validation.ok) throw new Error(`Generated test failed validation after retry: ${validation.reason}`);
      }
    }

    // The review pass is the third sequential model call and the most expensive (it
    // re-sends the entire generated test). English is skipped entirely: its underlined
    // "NO CHANGE" format is already strongly self-validated by validateGenerated, and it
    // is by far the heaviest/slowest section — the review call is exactly what tips it
    // over the timeout budget. Other sections keep it, but only if enough wall-clock
    // budget remains, and with a per-call timeout bounded by that remaining budget.
    const reviewRemaining = REVIEW_SOFT_DEADLINE_MS - (Date.now() - startTime);
    if (section === 'english') {
      console.log('⏭️ [GENERATE API] Skipping evaluation pass for English (self-validated, latency-sensitive)');
    } else if (reviewRemaining < MIN_REVIEW_MS) {
      console.log(`⏭️ [GENERATE API] Skipping evaluation pass — only ${reviewRemaining}ms of budget left`);
    } else {
      console.log('🔵 [GENERATE API] Running evaluation/revision pass...');
      try {
        const reviewCompletion = await openai.beta.chat.completions.parse(
          {
            model: process.env.OPENAI_MODEL ?? 'gpt-5.1',
            reasoning_effort: REASONING_EFFORT,
            messages: [
              { role: 'system', content: buildReviewSystemMessage(section) },
              { role: 'user', content: buildReviewUserMessage(parsed) },
            ],
            response_format: zodResponseFormat(schema, 'preact_test_review'),
          },
          { timeout: Math.min(reviewRemaining, 90_000) }
        );
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
