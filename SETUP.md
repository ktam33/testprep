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

## Deploying to Fly.io

The app keeps its SQLite file on disk and runs the pregeneration worker inside the server
process, so it needs **one always-on machine with a persistent volume** — not a serverless
platform. `fly.toml` pins `min_machines_running = 1` and disables auto-stop for that reason;
don't scale past one machine, since a second one can't attach the same volume.

1. **Install flyctl and sign in:**
   ```bash
   brew install flyctl && fly auth login
   ```

2. **Create the app and its volume:**
   ```bash
   fly launch --no-deploy    # keep the existing fly.toml when prompted
   fly volumes create testprep_data --size 1 --region ord
   ```

3. **Set secrets.** `APP_PASSWORD` is the shared password for the site (see `src/proxy.ts`);
   any username works at the browser prompt.
   ```bash
   fly secrets set OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-5.1 APP_PASSWORD=<choose-one>
   ```

4. **Deploy:**
   ```bash
   fly deploy
   ```

### Moving existing data up

Don't copy the `.sqlite3` file on its own — WAL mode means recent writes may still be sitting
in the `-wal` sidecar. `VACUUM INTO` writes a single consistent snapshot:

```bash
sqlite3 data/preact-testprep.sqlite3 "VACUUM INTO '/tmp/seed.sqlite3'"
fly ssh sftp shell     # then: put /tmp/seed.sqlite3 /app/data/preact-testprep.sqlite3
fly apps restart preact-testprep
```

### Backups

Fly volumes are a single copy on one host. `fly volumes snapshots list <volume-id>` shows the
automatic daily snapshots; for anything you'd actually want to restore from, run the
`VACUUM INTO` above on a schedule and copy the result off-host.

## File Structure

- `src/utils/db.ts` — SQLite connection, schema, seeding, query helpers
- `src/utils/categories.ts` — the 57-category skill taxonomy
- `src/utils/weighting.ts` — adaptive question-allocation algorithm
- `src/utils/passageLayout.ts` — per-section passage/question layout + category assignment
- `src/utils/grading.ts` — local answer grading
- `src/utils/schemas.ts` — Zod schemas used for OpenAI structured outputs
- `src/app/api/tests/generate/route.ts` — test generation (OpenAI call)
- `src/app/api/tests/[attemptId]/submit/route.ts` — grading endpoint
