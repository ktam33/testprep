import { getDb, countAvailablePregen, insertPregeneratedTest, getCategoryStats, listUsers } from '@/utils/db';
import { generateTest } from '@/utils/testGenerator';
import { Section, SECTIONS } from '@/types';

// Target number of ready-to-use pool tests to keep on hand per user, per section.
export const PREGEN_TARGET_PER_SECTION = 2;

// Stop the fill loop after this many generations fail back-to-back, so a persistent
// failure (bad API key, model outage) can't spin forever.
const MAX_CONSECUTIVE_FAILURES = 3;

interface GeneratingRef {
  userId: number;
  section: Section;
}

interface PregenState {
  generating: GeneratingRef | null; // the (user, section) currently being generated, if any
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
  generatingSection: Section | null; // the section being generated FOR THIS USER, if any
  lastError: string | null;
  lastErrorAt: string | null;
}

// Status scoped to a single user: their available counts, and whether the worker is
// currently generating for them specifically.
export function getPregenStatus(userId: number): PregenStatus {
  return {
    target: PREGEN_TARGET_PER_SECTION,
    available: countAvailablePregen(getDb(), userId),
    generatingSection: state.generating?.userId === userId ? state.generating.section : null,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt,
  };
}

// The next (user, section) slot anywhere that is below target, or null if all pools are full.
function nextSlotToFill(): GeneratingRef | null {
  const db = getDb();
  for (const user of listUsers(db)) {
    const counts = countAvailablePregen(db, user.id);
    const section = SECTIONS.find((s) => (counts[s] ?? 0) < PREGEN_TARGET_PER_SECTION);
    if (section) return { userId: user.id, section };
  }
  return null;
}

/**
 * Fire-and-forget: ensure every user has PREGEN_TARGET_PER_SECTION available pool tests per
 * section, generating them one at a time using each user's own adaptive category stats.
 * Safe to call often — if the fill loop is already running, or there is no API key, it
 * returns immediately. Never throws (background use).
 */
export async function triggerPregeneration(): Promise<void> {
  if (state.looping) return;
  if (!process.env.OPENAI_API_KEY) return;

  state.looping = true;
  let consecutiveFailures = 0;
  try {
    let slot = nextSlotToFill();
    while (slot) {
      state.generating = slot;
      try {
        const db = getDb();
        // Adaptive: weight the pool test by this user's real performance history.
        const stats = getCategoryStats(db, slot.userId, slot.section);
        const content = await generateTest(slot.section, stats);
        insertPregeneratedTest(db, slot.userId, slot.section, JSON.stringify(content));
        state.lastError = null;
        consecutiveFailures = 0;
        console.log(`✅ [PREGEN] Stored a ${slot.section} test for user ${slot.userId}`);
      } catch (err: any) {
        state.lastError = err?.message ?? String(err);
        state.lastErrorAt = new Date().toISOString();
        consecutiveFailures += 1;
        console.log(`⚠️ [PREGEN] Failed to generate ${slot.section} for user ${slot.userId}: ${state.lastError}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.log('⚠️ [PREGEN] Too many consecutive failures — pausing the fill loop');
          break;
        }
      } finally {
        state.generating = null;
      }
      slot = nextSlotToFill();
    }
  } finally {
    state.looping = false;
    state.generating = null;
  }
}
