import { Section } from '@/types';
import { shuffle } from './random';

/**
 * Topic seeding. Generation prompts are otherwise a pure function of (section, category
 * tally), so every call — including the five *parallel* passage calls within one test —
 * sees identical instructions and independently lands on the model's modal topic. That is
 * how one English test ended up with four passages about community gardens.
 *
 * A seed injects a concrete subject into each call. Seeds are drawn without replacement
 * within a test (kills within-test collisions) and preferentially avoid labels used by the
 * user's recent tests (kills across-test repetition).
 */
export interface TopicSeed {
  /** Avoid-list keys this seed consumes; persisted with the attempt. */
  labels: string[];
  /** Prompt fragment injected into the generation call. */
  instruction: string;
}

// How the passage is written, independent of what it is about. Real ACT English mixes
// these modes across its five passages; without the steer the model defaults to a
// first-person school-project narrative nearly every time.
const ENGLISH_MODES = [
  'a first-person personal narrative about a formative experience',
  'a historical account of an event, place, or movement',
  'a profile of one specific person and the work they do',
  'an explainer describing how something is made or how a process works',
  'an essay about an art form, craft, or cultural tradition',
  'a report on a community project, program, or local institution',
  'a place-based description essay about a specific location',
  'a retrospective essay reflecting on how something changed over time',
];

const ENGLISH_DOMAINS = [
  'letterpress printing',
  'urban beekeeping',
  'the restoration of a historic theater',
  'competitive marching band',
  'tidal marsh restoration',
  'a neighborhood bike co-op',
  'glassblowing',
  'archaeological fieldwork',
  'volunteer wildfire lookouts',
  'the history of the public library system',
  'stop-motion animation',
  'a family-run tortilleria',
  'birdsong recording and acoustic ecology',
  'the mail-order seed catalog industry',
  'skateboard park design',
  'lighthouse keeping',
  'quilting traditions',
  'a high-altitude weather station',
  'the invention of the shipping container',
  'community radio stations',
  'fossil preparation in a museum lab',
  'canal boat culture',
  'sign language interpretation in theater',
  'the resurgence of passenger rail',
  'street food vending regulations',
  'blacksmithing and toolmaking',
  'seed banks and crop diversity',
  'the history of the crossword puzzle',
  'sled dog racing',
  'restoring vintage arcade machines',
  'cave surveying and mapping',
  'a rooftop farm',
  'traditional boat building',
  'the science of stage lighting',
  'urban tree canopies',
  'amateur radio operators',
];

// Reading passage types are fixed genres, so each gets its own subject pool.
const READING_DOMAINS: Record<string, string[]> = {
  'Literary Narrative': [
    'a teenager working a summer job at a marina',
    'siblings clearing out a grandparent’s apartment',
    'a new student navigating a rural boarding school',
    'a young musician auditioning for a conservatory',
    'a family running a roadside diner',
    'a girl apprenticing with a village clockmaker',
    'a boy training a rescued racing pigeon',
    'a dancer recovering from an injury',
    'a young translator working at a border crossing',
    'a family relocating to a remote island',
    'a teenager working on a fishing crew',
    'two cousins restoring an abandoned orchard',
  ],
  'Social Science': [
    'how cities decide where to place parks',
    'the economics of secondhand clothing markets',
    'the spread of literacy through traveling libraries',
    'why some languages lose speakers and others gain them',
    'the social role of public bathhouses',
    'how census-taking shapes political representation',
    'migration patterns of seasonal agricultural workers',
    'the rise of the co-operative business model',
    'how school start times affect adolescent behavior',
    'the history of standardized time zones',
    'informal lending circles in immigrant communities',
    'the effect of highway construction on neighborhoods',
  ],
  Humanities: [
    'the evolution of graphic novels as a literary form',
    'the restoration of damaged frescoes',
    'the role of the griot in West African storytelling',
    'how film scores shape audience emotion',
    'the architecture of vernacular houses',
    'the history of botanical illustration',
    'the tradition of shadow puppet theater',
    'the influence of jazz on twentieth-century poetry',
    'the practice of literary translation',
    'the design history of public transit maps',
    'the revival of traditional dyeing techniques',
    'the role of museums in repatriating artifacts',
  ],
  'Natural Science': [
    'how tardigrades survive extreme conditions',
    'the mechanics of bird migration navigation',
    'permafrost thaw and ancient microorganisms',
    'the physics of how sand dunes move',
    'fungal networks and forest communication',
    'the chemistry of self-healing concrete',
    'deep-sea hydrothermal vent ecosystems',
    'how bats process echolocation signals',
    'the formation and behavior of lightning',
    'gene editing in agricultural crops',
    'the role of aerosols in cloud formation',
    'how octopuses control skin texture and color',
  ],
};

// Science passages get a discipline rather than a fully specified scenario — the passage
// type (Conflicting Viewpoints / Research Summary / Data Representation) already dictates
// the shape, and the discipline is what was collapsing to ecology on every test.
const SCIENCE_DISCIPLINES = [
  'plant biology',
  'animal behavior',
  'human physiology and exercise science',
  'genetics and heredity',
  'microbiology',
  'chemical reactions and solution chemistry',
  'materials science and properties of matter',
  'motion, forces, and friction',
  'energy, heat transfer, and insulation',
  'waves, light, and optics',
  'sound and acoustics',
  'electricity and magnetism',
  'geology and rock formation',
  'weather and atmospheric science',
  'oceanography and tides',
  'astronomy and planetary science',
  'soil science and agriculture',
  'water quality and filtration',
  'food science and preservation',
  'entomology',
  'paleontology',
  'renewable energy systems',
];

// Real-world settings for Math word problems. Math is a single call for all 30 questions,
// so within-call variety is already decent; these fight the across-test sameness that
// makes every test's word problems about pizza slices and train speeds.
const MATH_CONTEXTS = [
  'a school robotics club budget',
  'a bakery scaling up recipes',
  'bike repair and gear ratios',
  'a community pool’s water usage',
  'a farmer’s market stall',
  'concert ticket sales and seating',
  'video game streaming statistics',
  'a home renovation project',
  'weather and temperature records',
  'an animal shelter’s intake numbers',
  'a hiking trail’s elevation profile',
  'shipping and packaging dimensions',
  'darkroom photography chemistry',
  'a science fair’s judging scores',
  'bus routes and transit schedules',
  'a charity fundraising drive',
  'track and field performance data',
  'the school newspaper’s print run',
  'a greenhouse’s planting layout',
  'a rock climbing gym membership',
  'solar panel output over a year',
  'a food truck’s daily sales',
];

const MATH_CONTEXTS_PER_TEST = 8;

/**
 * Draws `count` items, preferring ones not in `avoid`. When the fresh supply runs out it
 * falls back to avoided items rather than returning short, so a user with a long history
 * still gets a full set of seeds.
 */
function sampleAvoiding(pool: readonly string[], count: number, avoid: ReadonlySet<string>): string[] {
  const fresh = shuffle(pool.filter((x) => !avoid.has(x)));
  const stale = shuffle(pool.filter((x) => avoid.has(x)));
  const picked = [...fresh, ...stale].slice(0, count);
  // Only reachable if a pool is smaller than the number of passages that need seeding.
  for (let i = 0; picked.length < count && pool.length > 0; i++) picked.push(pool[i % pool.length]);
  return picked;
}

const NOVELTY_NUDGE =
  'Choose a specific, concrete angle within this subject rather than the most familiar textbook example of it.';

function englishInstruction(mode: string, domain: string): string {
  return `TOPIC FOR THIS PASSAGE: write it as ${mode}, on the subject of ${domain}. Stay on this subject for the entire passage — do not drift to school clubs, gardening, or volunteering unless that is the assigned subject. ${NOVELTY_NUDGE}`;
}

function readingInstruction(passageType: string, domain: string): string {
  return `TOPIC FOR THIS PASSAGE: ${domain}. Keep the passage within the "${passageType}" genre while staying on this subject. ${NOVELTY_NUDGE}`;
}

function scienceInstruction(passageType: string, discipline: string): string {
  const shape = passageType.startsWith('Conflicting Viewpoints')
    ? 'Present two or three named students or scientists who genuinely disagree about a question in this field.'
    : passageType.startsWith('Research Summary')
    ? 'Describe two or three related experiments a student or research team ran in this field.'
    : 'Present a concrete data set collected in this field.';
  return `SUBJECT AREA FOR THIS PASSAGE: ${discipline}. ${shape} ${NOVELTY_NUDGE}`;
}

/**
 * One seed per passage, in the same order as `passageTypes`. Subjects are distinct within
 * the test and biased away from `recentLabels`.
 */
export function planPassageTopics(
  section: Section,
  passageTypes: string[],
  recentLabels: string[] = []
): TopicSeed[] {
  const avoid = new Set(recentLabels);
  const n = passageTypes.length;

  if (section === 'english') {
    // Modes are structural rather than subject matter, so they are only de-duplicated
    // within the test — there is no reason to avoid a mode just because it was used before.
    const modes = sampleAvoiding(ENGLISH_MODES, n, new Set());
    const domains = sampleAvoiding(ENGLISH_DOMAINS, n, avoid);
    return passageTypes.map((_, i) => ({
      labels: [domains[i]],
      instruction: englishInstruction(modes[i], domains[i]),
    }));
  }

  if (section === 'science') {
    const disciplines = sampleAvoiding(SCIENCE_DISCIPLINES, n, avoid);
    return passageTypes.map((type, i) => ({
      labels: [disciplines[i]],
      instruction: scienceInstruction(type, disciplines[i]),
    }));
  }

  if (section === 'reading') {
    // Each genre draws from its own pool, so exclusion has to accumulate across passages
    // to keep two same-genre passages (should the layout ever have any) off one subject.
    const used = new Set(avoid);
    return passageTypes.map((type) => {
      const pool = READING_DOMAINS[type];
      if (!pool) return { labels: [], instruction: '' };
      const [domain] = sampleAvoiding(pool, 1, used);
      used.add(domain);
      return { labels: [domain], instruction: readingInstruction(type, domain) };
    });
  }

  return passageTypes.map(() => ({ labels: [], instruction: '' }));
}

/** A single seed covering all 30 Math questions, since they are generated in one call. */
export function planMathTopics(recentLabels: string[] = []): TopicSeed {
  const contexts = sampleAvoiding(MATH_CONTEXTS, MATH_CONTEXTS_PER_TEST, new Set(recentLabels));
  return {
    labels: contexts,
    instruction: `CONTEXTS FOR THIS TEST: draw the real-world settings for word problems and applied questions from this list, spreading them out so no single setting dominates: ${contexts.join(
      '; '
    )}. Purely abstract questions (simplify, solve for x, and similar) need no setting. Within each setting, choose a specific, concrete situation rather than the most familiar textbook version of it.`,
  };
}
