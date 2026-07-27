import { getDb, countAvailablePregen, insertPregeneratedTest, getColdStartCategoryStats } from '@/utils/db';
import { generateTest } from '@/utils/testGenerator';
import { Section, SECTIONS } from '@/types';

// Target number of ready-to-use pool tests to keep on hand per section.
export const PREGEN_TARGET_PER_SECTION = 2;

// Stop the fill loop after this many generations fail back-to-back, so a persistent
// failure (bad API key, model outage) can't spin forever.
const MAX_CONSECUTIVE_FAILURES = 3;

interface PregenState {
  generating: Section | null; // the section currently being generated, if any
  looping: boolean; // whether the fill loop is active (single-flight guard)
  lastError: string | null;
  lastErrorAt: string | null;
}

// The pre-generation worker runs inside the single Node server process. Its live state is
// in-memory (so the admin screen can read "currently generating"), stashed on globalThis so
// it survives dev HMR module reloads. NOTE: this assumes one long-running process — it does
// not coordinate across multiple serverless instances.
const globalRef = globalThis as unknown as { __pregenState?: PregenState };
const state: PregenState =
  globalRef.__pregenState ?? (globalRef.__pregenState = { generating: null, looping: false, lastError: null, lastErrorAt: null });

export interface PregenStatus {
  target: number;
  available: Record<Section, number>;
  generating: Section | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export function getPregenStatus(): PregenStatus {
  return {
    target: PREGEN_TARGET_PER_SECTION,
    available: countAvailablePregen(getDb()),
    generating: state.generating,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt,
  };
}

function sectionsBelowTarget(): Section[] {
  const counts = countAvailablePregen(getDb());
  return SECTIONS.filter((s) => (counts[s] ?? 0) < PREGEN_TARGET_PER_SECTION);
}

/**
 * Fire-and-forget: ensure every section has PREGEN_TARGET_PER_SECTION available pool tests,
 * generating them one at a time. Safe to call often — if the fill loop is already running,
 * or there is no API key, it returns immediately. Never throws (background use).
 */
export async function triggerPregeneration(): Promise<void> {
  if (state.looping) return;
  if (!process.env.OPENAI_API_KEY) return;

  state.looping = true;
  let consecutiveFailures = 0;
  try {
    while (sectionsBelowTarget().length > 0) {
      // Recompute each iteration: submits/claims change the counts underneath us.
      const section = sectionsBelowTarget()[0];
      state.generating = section;
      try {
        const db = getDb();
        const content = await generateTest(section, getColdStartCategoryStats(db, section));
        insertPregeneratedTest(db, section, JSON.stringify(content));
        state.lastError = null;
        consecutiveFailures = 0;
        console.log(`✅ [PREGEN] Stored a pre-generated ${section} test`);
      } catch (err: any) {
        state.lastError = err?.message ?? String(err);
        state.lastErrorAt = new Date().toISOString();
        consecutiveFailures += 1;
        console.log(`⚠️ [PREGEN] Failed to generate ${section}: ${state.lastError}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.log('⚠️ [PREGEN] Too many consecutive failures — pausing the fill loop');
          break;
        }
      } finally {
        state.generating = null;
      }
    }
  } finally {
    state.looping = false;
    state.generating = null;
  }
}
