# PreACT TestPrep

A local practice-test app for the PreACT 9 Secure exam. Generates adaptive 30-question practice tests for English, Math, Reading, and Science, tracks results across attempts, and skews future tests toward the skill categories a student has struggled with.

## Features

### Adaptive practice tests
- Each section (English, Math, Reading, Science) has its own skill taxonomy (57 categories total — see `plan/PreACT_Master_Skill_Categories.md`).
- Every 30-question test covers **every** category in the section at least once, with extra questions weighted toward categories the student has historically answered incorrectly.
- English, Reading, and Science questions are grouped into passages (matching the real test format); Math questions are standalone.
- Questions are generated live via the OpenAI API using structured outputs, so every question is guaranteed to have a valid category tag, four choices, a correct answer, and an explanation — no second AI call needed to grade.
- After generation, a second model pass reviews and, where needed, rewrites each question — checking that it makes sense (clear, unambiguous, answerable from its passage) and that the marked answer and explanation are actually correct — before the test is saved.

### Multiple profiles
- No accounts or passwords — pick or create a named profile from the home screen, and progress is tracked separately per profile. Intended for a household with more than one student prepping.

### Progress tracking
- Per-category accuracy for each section, computed from full attempt history.
- Attempt history with scores, reviewable question-by-question with explanations.

## Tech Stack

- **Frontend**: React with Next.js (App Router), TypeScript, Tailwind CSS
- **AI Integration**: OpenAI API with structured outputs (Zod schemas)
- **Database**: SQLite (`better-sqlite3`)
- **Testing**: Vitest

## Quick Start

See `SETUP.md` for full setup instructions.

```bash
npm install
cp .env.example .env.local   # add your OPENAI_API_KEY
npm run dev
```

Open `http://localhost:3000`.

## Project Structure

```
├── data/                          # SQLite DB file, created at runtime (gitignored)
├── plan/
│   └── PreACT_Master_Skill_Categories.md   # the 57-category skill taxonomy
├── src/
│   ├── app/
│   │   ├── page.tsx                # profile picker
│   │   ├── dashboard/              # per-profile section overview
│   │   ├── sections/[section]/     # per-section history + "start test"
│   │   ├── test/[attemptId]/       # take-test + results/review
│   │   └── api/                    # users, tests, progress endpoints
│   ├── components/                 # UI components
│   ├── types/                      # shared TypeScript interfaces
│   └── utils/                      # db, category taxonomy, weighting algorithm,
│                                    # passage layout, grading, structured-output schemas
└── package.json
```

## How the adaptive weighting works

For a given section, every category is guaranteed at least one question. The remaining slots are distributed proportionally to how often the student has answered that category's questions incorrectly (with Laplace smoothing so brand-new categories start on equal footing rather than being over- or under-weighted). See `src/utils/weighting.ts`.

## License

For personal / educational use.
