# PreACT TestPrep — Setup Instructions

## Prerequisites
- Node.js 18+
- An OpenAI API key
- macOS/Linux users: Xcode Command Line Tools (or equivalent build toolchain) may be needed the first time, since `better-sqlite3` compiles a native addon during `npm install`.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local`:
   ```
   OPENAI_API_KEY=your_actual_openai_api_key_here
   OPENAI_MODEL=gpt-5.1
   ```

   > **Note on `OPENAI_MODEL`:** model names change frequently. `gpt-5.1` is the default at the time this app was built — if that model has since been retired or a newer one is recommended, check OpenAI's current model list and update `.env.local` (no code changes needed). The model must support Structured Outputs (`response_format` with a JSON schema).

3. **Run the dev server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:** navigate to `http://localhost:3000`.

   The SQLite database is created automatically at `data/preact-testprep.sqlite3` on first run, and the 57-category skill taxonomy is seeded automatically.

## Usage

1. On first visit, create a profile (just a name — no password).
2. From the dashboard, pick a section and click "Start New Practice Test." This calls OpenAI to generate 30 questions (grouped into passages for English/Reading/Science) and can take up to a minute or so.
3. Answer questions, then submit. You'll see your score and a per-category breakdown, plus full answer explanations.
4. Over time, the app tracks which categories you're weakest in and generates more questions from those categories in future tests, while still covering every category.
5. Switch profiles anytime via the "Switch profile" link in the header.

## Running tests

```bash
npm test          # single run
npm run test:watch  # watch mode
```

Tests cover the pure business logic (question-allocation weighting, passage layout, grading) and the SQLite data layer, run against an in-memory database — no OpenAI calls are made during tests.

## File Structure

- `src/utils/db.ts` — SQLite connection, schema, seeding, query helpers
- `src/utils/categories.ts` — the 57-category skill taxonomy
- `src/utils/weighting.ts` — adaptive question-allocation algorithm
- `src/utils/passageLayout.ts` — per-section passage/question layout + category assignment
- `src/utils/grading.ts` — local answer grading
- `src/utils/schemas.ts` — Zod schemas used for OpenAI structured outputs
- `src/app/api/tests/generate/route.ts` — test generation (OpenAI call)
- `src/app/api/tests/[attemptId]/submit/route.ts` — grading endpoint
