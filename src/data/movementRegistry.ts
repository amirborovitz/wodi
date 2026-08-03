/**
 * THE movement registry — one lookup table behind every "what did I do a lot of"
 * question the recap asks.
 *
 * Replaces the old `MOVEMENT_FAMILIES` table, whose matching was ORDER-DEPENDENT:
 * the first family whose alias matched won, so every new alias risked silently
 * re-routing an existing movement ("Squat Clean" had to meet Clean before Squat).
 * Here a known movement is an exact keyed lookup, and the only fuzzy path —
 * longest-phrase match — is order-independent by construction.
 *
 * Two grains, both needed, deliberately kept apart:
 *   - `canonicalName` — fine. "Push Press" ≠ "Push Jerk". What PRs would care about.
 *   - `familyId`      — coarse. Both are Shoulder to Overhead. What the recap shows.
 *
 * FAMILIES ARE A CLOSED SET. An unrecognised movement resolves to `familyId: null`
 * and gets flagged for triage — it never invents a family, and it never headlines
 * a recap. Growing the family list is a human decision, not a parse-time one.
 *
 * Scope: recap aggregation only. This never touches `MovementTotal.name`, which is
 * the coach's own wording and the only thing posters render.
 */
import { MOVEMENT_REGISTRY_SEED } from './movementRegistry.seed';

// ── Families: the closed set ─────────────────────────────────────────────────

export const MOVEMENT_FAMILY_IDS = [
  // Barbell / implement-split lifts. A KB snatch and a barbell snatch are
  // different lifts, so the implement is part of the row's identity.
  'clean', 'snatch', 'clean_and_jerk', 'thruster', 'shoulder_to_overhead',
  'deadlift', 'sumo_deadlift_high_pull', 'bench_press', 'strength_row',
  'swing', 'good_morning', 'hip_thrust', 'curl', 'carry',

  // Pattern-first. The movement pattern is the story and the implement is a
  // variant, not an identity — an air squat and a goblet squat are both squats.
  'squat', 'lunge', 'step_up', 'box_jump', 'burpee', 'push_up', 'pull_up',
  'dip', 'toes_to_bar', 'muscle_up', 'sit_up', 'core', 'pistol',
  'handstand_push_up', 'handstand_walk', 'wall_walk', 'wall_ball', 'ring_row',
  'rope_climb', 'double_under', 'single_under', 'devil_press', 'man_maker',
  'turkish_get_up', 'shoulder_prehab',

  // Cardio. Measured in metres and calories, never reps — these are rolled up
  // by `buildCardioStats` and never reach the rep ledger.
  'bike', 'row_erg', 'ski', 'run', 'swim',
] as const;

export type MovementFamilyId = typeof MOVEMENT_FAMILY_IDS[number];

export type MovementImplement =
  | 'barbell' | 'kettlebell' | 'dumbbell' | 'machine' | 'bodyweight';

/**
 * What KIND of work a family is — the axis that decides which movements may be
 * compared with which.
 *
 * The recap's founding complaint: 4,250 double-unders outranking 100 cleans and
 * implying the skipping mattered more. Reps are not a universal currency, so a
 * family only ever competes inside its own category.
 *
 *  - `strength`     — loaded work. Ranked by reps, and by tonnage where weight is known.
 *  - `gymnastics`   — bodyweight skill. Ranked by reps against other gymnastics.
 *  - `conditioning` — movements whose rep counts are naturally an order of magnitude
 *                     larger (double-unders, burpees). Real work, own section, never
 *                     allowed to headline the movement board.
 *  - `core`         — midline accessory work: twists, leg raises, sit-ups. Cheap to
 *                     repeat by the hundred and nobody's month was defined by it.
 *                     Its own category rather than `gymnastics`, because filing it
 *                     next to muscle-ups is what let 605 sit-ups outrank 603 cleans.
 *  - `cardio`       — measured in metres and calories, never reps. Kept out of the
 *                     rep ledger entirely by `buildMoveStats`.
 *  - `accessory`    — prehab and odds and ends. Counted, never featured.
 */
export type MovementCategory =
  | 'strength' | 'gymnastics' | 'conditioning' | 'core' | 'cardio' | 'accessory';

/**
 * The one ladder that decides which work outranks which — lower wins.
 *
 * Reps are not a universal currency, so category comes before rep count in every
 * ranking the recap does. This is the whole answer to "why did Core get more
 * screen time than the barbell": it isn't a threshold or a weighting, it's an
 * order, and no rep count can climb it.
 *
 * Cardio sits outside the rep board entirely (it has its own hero card in its own
 * units) and is ranked last only so the map is total.
 */
const CATEGORY_PRIORITY: Record<MovementCategory, number> = {
  strength: 0,
  gymnastics: 1,
  conditioning: 2,
  core: 3,
  accessory: 4,
  cardio: 5,
};

/** Rank for sorting. Unplaced movements sort behind everything the registry knows. */
export function getCategoryRank(category: MovementCategory | null): number {
  return category === null ? 99 : CATEGORY_PRIORITY[category];
}

interface MovementFamilyDef {
  label: string;
  /**
   * True when the family merges across implements. False means the implement
   * prefixes the row label ("Kettlebell Swing" vs "Dumbbell Swing").
   */
  patternFirst: boolean;
  category: MovementCategory;
  /** Implement assumed when the name names none. CrossFit boards say "5 Cleans", not "5 Barbell Cleans". */
  defaultImplement: MovementImplement;
}

export const MOVEMENT_FAMILIES: Record<MovementFamilyId, MovementFamilyDef> = {
  clean:                  { label: 'Clean',                   patternFirst: false, category: 'strength', defaultImplement: 'barbell' },
  snatch:                 { label: 'Snatch',                  patternFirst: false, category: 'strength', defaultImplement: 'barbell' },
  clean_and_jerk:         { label: 'Clean & Jerk',            patternFirst: false, category: 'strength', defaultImplement: 'barbell' },
  thruster:               { label: 'Thruster',                patternFirst: false, category: 'strength', defaultImplement: 'barbell' },
  shoulder_to_overhead:   { label: 'Shoulder to Overhead',    patternFirst: false, category: 'strength', defaultImplement: 'barbell' },
  deadlift:               { label: 'Deadlift',                patternFirst: false, category: 'strength', defaultImplement: 'barbell' },
  sumo_deadlift_high_pull:{ label: 'Sumo Deadlift High Pull', patternFirst: false, category: 'strength', defaultImplement: 'barbell' },
  bench_press:            { label: 'Bench Press',             patternFirst: false, category: 'strength', defaultImplement: 'barbell' },
  strength_row:           { label: 'Row',                     patternFirst: false, category: 'strength', defaultImplement: 'barbell' },
  swing:                  { label: 'Swing',                   patternFirst: false, category: 'strength', defaultImplement: 'kettlebell' },
  good_morning:           { label: 'Good Morning',            patternFirst: false, category: 'strength', defaultImplement: 'barbell' },
  hip_thrust:             { label: 'Hip Thrust',              patternFirst: false, category: 'strength', defaultImplement: 'barbell' },
  curl:                   { label: 'Curl',                    patternFirst: false, category: 'accessory', defaultImplement: 'dumbbell' },
  carry:                  { label: 'Carry',                   patternFirst: false, category: 'strength', defaultImplement: 'dumbbell' },

  squat:                  { label: 'Squat',                   patternFirst: true,  category: 'strength', defaultImplement: 'bodyweight' },
  lunge:                  { label: 'Lunge',                   patternFirst: true,  category: 'strength', defaultImplement: 'bodyweight' },
  step_up:                { label: 'Step-up',                 patternFirst: true,  category: 'strength', defaultImplement: 'bodyweight' },
  wall_ball:              { label: 'Wall Ball',               patternFirst: true,  category: 'strength', defaultImplement: 'bodyweight' },
  devil_press:            { label: 'Devil Press',             patternFirst: true,  category: 'strength', defaultImplement: 'dumbbell' },
  man_maker:              { label: 'Man Maker',               patternFirst: true,  category: 'strength', defaultImplement: 'dumbbell' },
  turkish_get_up:         { label: 'Turkish Get-up',          patternFirst: true,  category: 'strength', defaultImplement: 'kettlebell' },

  box_jump:               { label: 'Box Jump',                patternFirst: true,  category: 'gymnastics', defaultImplement: 'bodyweight' },
  push_up:                { label: 'Push-up',                 patternFirst: true,  category: 'gymnastics', defaultImplement: 'bodyweight' },
  pull_up:                { label: 'Pull-up',                 patternFirst: true,  category: 'gymnastics', defaultImplement: 'bodyweight' },
  dip:                    { label: 'Dip',                     patternFirst: true,  category: 'gymnastics', defaultImplement: 'bodyweight' },
  toes_to_bar:            { label: 'Toes to Bar',             patternFirst: true,  category: 'gymnastics', defaultImplement: 'bodyweight' },
  muscle_up:              { label: 'Muscle-up',               patternFirst: true,  category: 'gymnastics', defaultImplement: 'bodyweight' },
  // Midline work, not gymnastics skill. See `core` in MovementCategory.
  sit_up:                 { label: 'Sit-up',                  patternFirst: true,  category: 'core',       defaultImplement: 'bodyweight' },
  core:                   { label: 'Core',                    patternFirst: true,  category: 'core',       defaultImplement: 'bodyweight' },
  pistol:                 { label: 'Pistol',                  patternFirst: true,  category: 'gymnastics', defaultImplement: 'bodyweight' },
  handstand_push_up:      { label: 'Handstand Push-up',       patternFirst: true,  category: 'gymnastics', defaultImplement: 'bodyweight' },
  handstand_walk:         { label: 'Handstand Walk',          patternFirst: true,  category: 'gymnastics', defaultImplement: 'bodyweight' },
  wall_walk:              { label: 'Wall Walk',               patternFirst: true,  category: 'gymnastics', defaultImplement: 'bodyweight' },
  ring_row:               { label: 'Ring Row',                patternFirst: true,  category: 'gymnastics', defaultImplement: 'bodyweight' },
  rope_climb:             { label: 'Rope Climb',              patternFirst: true,  category: 'gymnastics', defaultImplement: 'bodyweight' },

  // Not lesser work — just work counted in hundreds. A burpee month and a clean
  // month are both real, and putting them on one leaderboard only ever tells you
  // which movement is cheap to repeat.
  burpee:                 { label: 'Burpee',                  patternFirst: true,  category: 'conditioning', defaultImplement: 'bodyweight' },
  double_under:           { label: 'Double Under',            patternFirst: true,  category: 'conditioning', defaultImplement: 'bodyweight' },
  single_under:           { label: 'Single Under',            patternFirst: true,  category: 'conditioning', defaultImplement: 'bodyweight' },

  shoulder_prehab:        { label: 'Shoulder Prehab',         patternFirst: true,  category: 'accessory', defaultImplement: 'bodyweight' },

  bike:                   { label: 'Bike',   patternFirst: true, category: 'cardio', defaultImplement: 'machine' },
  row_erg:                { label: 'Row',    patternFirst: true, category: 'cardio', defaultImplement: 'machine' },
  ski:                    { label: 'Ski',    patternFirst: true, category: 'cardio', defaultImplement: 'machine' },
  run:                    { label: 'Run',    patternFirst: true, category: 'cardio', defaultImplement: 'bodyweight' },
  swim:                   { label: 'Swim',   patternFirst: true, category: 'cardio', defaultImplement: 'bodyweight' },
};

export function getFamilyCategory(familyId: MovementFamilyId | null): MovementCategory | null {
  return familyId === null ? null : MOVEMENT_FAMILIES[familyId].category;
}

/**
 * The ledger row label for a family done with a given implement — implement-
 * prefixed unless the family is pattern-first. The one place that spelling is
 * decided, so a resolved movement and a compound's component row can't disagree
 * about what the same row is called.
 */
export function familyLabelFor(familyId: MovementFamilyId, implement: MovementImplement): string {
  const family = MOVEMENT_FAMILIES[familyId];
  return family.patternFirst ? family.label : `${titleCase(implement)} ${family.label}`;
}

export function isCardioFamily(familyId: MovementFamilyId | null): boolean {
  return getFamilyCategory(familyId) === 'cardio';
}

// ── Registry entries ─────────────────────────────────────────────────────────

export interface MovementRegistryEntry {
  /** Fine-grained name. Variants stay apart at this grain. */
  canonicalName: string;
  family: MovementFamilyId;
  /** Omit to inherit the family's default. */
  implement?: MovementImplement;
  /** What distinguishes this movement inside its family ("American", "Power"). */
  variant?: string;
  /**
   * Extra spellings. The canonical name is always matchable and needn't be
   * repeated here. Modifiers like "alt" / "weighted" are stripped before
   * matching, so they never need listing either.
   */
  aliases?: string[];
  /**
   * Match only when the alias is the ENTIRE name. "Row" alone is the erg;
   * "Bent Over Row" is barbell work, and no word-boundary rule separates them.
   */
  exactOnly?: true;
}

// ── Name normalization ───────────────────────────────────────────────────────

/**
 * Section prefixes the parser sometimes welds onto a movement name
 * ("Buy-in: Dumbbell Hip Thrust"). Stripped before anything else so the
 * movement matches its own registry entry.
 */
const SECTION_PREFIX = /^(buy[\s-]?in|cash[\s-]?out|warm[\s-]?up|cool[\s-]?down|finisher|accessory|part\s*[a-e]|[a-e])\s*[:.]\s*/i;

/**
 * Modifiers that describe HOW a movement was done, not WHICH movement it was.
 * Stripped before lookup so "Alt DB Snatch" finds the "DB Snatch" entry without
 * the registry having to enumerate every prefix combination.
 */
const MODIFIER_WORDS = new Set([
  'alt', 'alternating', 'alternate', 'alternated',
  'weighted', 'loaded', 'single', 'double', 'dual', 'twin', 'pair', 'paired',
  'strict', 'kipping', 'butterfly', 'tempo', 'paused', 'pause',
  'touch', 'and', 'go', 'tng', 'unbroken', 'max', 'heavy', 'light',
  'seated', 'standing', 'banded', 'assisted', 'partner',
  'right', 'left', 'each', 'side', 'per', 'total',
]);

/** Tokens that name the implement outright, whatever else the movement is. */
const IMPLEMENT_TOKENS: ReadonlyArray<readonly [MovementImplement, ReadonlySet<string>]> = [
  ['kettlebell', new Set(['kettlebell', 'kettlebells', 'kb', 'kbs', 'goblet'])],
  ['dumbbell',   new Set(['dumbbell', 'dumbbells', 'db', 'dbs'])],
  // Deliberately NOT 'bar' — that matches "toes to BAR" and "burpees over the BAR".
  ['barbell',    new Set(['barbell', 'bb'])],
];

/**
 * Singularize one word. Boards pluralize freely ("21 Thrusters", "Pike Leg
 * Raises", "Push Presses") and those must collapse onto one row — the live data
 * had `Russian Twist` 360 sitting next to `Russian Twists` 100.
 */
function singularize(word: string): string {
  if (word.length <= 2) return word;
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  // "presses" → "press". Checked before the bare -s rule, which would give "presse".
  if (word.endsWith('sses') || word.endsWith('ches') || word.endsWith('shes')
    || word.endsWith('xes') || word.endsWith('zes')) {
    return word.slice(0, -2);
  }
  // "raises" → "raise", "burpees" → "burpee". The -ss/-us/-is guards keep
  // singular words that merely end in s intact: "press", "bus", and the
  // anatomical names that show up in accessory work ("tibialis" → "tibiali").
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
    return word.slice(0, -1);
  }
  return word;
}

/** Lowercase, flatten separators, drop section prefixes, singularize every word. */
export function normalizeMovementKey(name: string): string {
  return name
    .replace(SECTION_PREFIX, '')
    .toLowerCase()
    .replace(/[-_/+&.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(singularize)
    .join(' ')
    .trim();
}

function detectImplement(words: readonly string[]): MovementImplement | null {
  for (const [implement, tokens] of IMPLEMENT_TOKENS) {
    if (words.some(w => tokens.has(w))) return implement;
  }
  return null;
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, c => c.toUpperCase());
}

// ── The registry singleton ───────────────────────────────────────────────────

interface CompiledEntry {
  entry: MovementRegistryEntry;
  /** Normalized alias phrases, longest first — including the canonical name. */
  phrases: string[];
}

interface CompiledRegistry {
  /** Normalized name (canonical + every alias) → entry. */
  exact: Map<string, MovementRegistryEntry>;
  /** Only entries eligible for phrase matching, longest phrase first. */
  phraseMatched: { phrase: string; words: string[]; entry: MovementRegistryEntry }[];
}

function compile(entries: readonly MovementRegistryEntry[]): CompiledRegistry {
  const exact = new Map<string, MovementRegistryEntry>();
  const compiled: CompiledEntry[] = [];

  for (const entry of entries) {
    const phrases = [entry.canonicalName, ...(entry.aliases ?? [])]
      .map(normalizeMovementKey)
      .filter(Boolean);
    for (const phrase of phrases) {
      // First writer wins so a later entry can't silently steal an earlier
      // entry's exact key — a duplicate alias is a seed bug, not a behaviour.
      if (!exact.has(phrase)) exact.set(phrase, entry);
    }
    compiled.push({ entry, phrases });
  }

  // Fuzzy matching is about the MOVEMENT, so implement tokens are stripped from
  // the index. Otherwise "Kettlebell Clean" (2 words) outranks "Clean & Jerk"
  // (2 words, fewer characters) and a KB clean & jerk files as a plain clean.
  // The implement is recovered separately by `detectImplement`, which reads the
  // caller's name rather than the matched entry's.
  const byPhrase = new Map<string, { phrase: string; words: string[]; entry: MovementRegistryEntry }>();
  for (const { entry, phrases } of compiled) {
    if (entry.exactOnly) continue;
    for (const phrase of phrases) {
      const stripped = phrase.split(' ').filter(w => !isImplementToken(w));
      // Some abbreviations ARE entirely implement tokens once normalized: "KBS"
      // singularizes to "kb", which is also the kettlebell token. Stripping would
      // drop the entry from the index altogether, so it stays under its own
      // spelling — that is how "American KBS" still finds the swing.
      const words = stripped.length > 0 ? stripped : phrase.split(' ');
      if (words.length === 0) continue;
      const key = words.join(' ');
      const existing = byPhrase.get(key);
      // Several entries collapse to the same stripped phrase ("Clean",
      // "Dumbbell Clean", "Kettlebell Clean" → "clean"). Keep the entry that
      // named no implement, so the winner doesn't depend on declaration order.
      if (existing && (!isGeneric(entry) || isGeneric(existing.entry))) continue;
      byPhrase.set(key, { phrase: key, words, entry });
    }
  }

  const phraseMatched = [...byPhrase.values()]
    // Longest phrase wins, so "clean jerk" beats "clean" regardless of the order
    // entries were declared in. Alphabetical tiebreak keeps it deterministic.
    .sort((a, b) => b.words.length - a.words.length || a.phrase.localeCompare(b.phrase));

  return { exact, phraseMatched };
}

function isImplementToken(word: string): boolean {
  return IMPLEMENT_TOKENS.some(([, tokens]) => tokens.has(word));
}

/** True when the entry's own name names no implement — the family's plain form. */
function isGeneric(entry: MovementRegistryEntry): boolean {
  return !normalizeMovementKey(entry.canonicalName).split(' ').some(isImplementToken);
}

// Defaults to the bundled seed, so the resolver is fully usable with no Firebase
// and no startup call — tests and scripts import it and it just works. The seed
// imports only a TYPE from this module, so there is no runtime import cycle.
let activeEntries: readonly MovementRegistryEntry[] = MOVEMENT_REGISTRY_SEED;
let compiled: CompiledRegistry = compile(MOVEMENT_REGISTRY_SEED);

/**
 * Swap in a registry. Called once at startup with the bundled seed, then again
 * if Firestore returns a newer snapshot. Tests call it directly.
 */
export function setMovementRegistry(entries: readonly MovementRegistryEntry[]): void {
  activeEntries = entries;
  compiled = compile(entries);
}

export function getMovementRegistry(): readonly MovementRegistryEntry[] {
  return activeEntries;
}

// ── Resolution ───────────────────────────────────────────────────────────────

export interface ResolvedMovement {
  /** Fine-grained canonical name, or the cleaned input when unknown. */
  canonicalName: string;
  /** null for movements the registry doesn't know — these never headline. */
  familyId: MovementFamilyId | null;
  /** Row label for the ledger: implement-prefixed unless the family is pattern-first. */
  familyLabel: string;
  implement: MovementImplement;
  /** Sub-line label inside the family ("American", "Power"), when there is one. */
  variant: string | null;
  /** How confident the match was — drives what lands in the flag queue. */
  match: 'exact' | 'phrase' | 'unknown';
}

/**
 * Resolve a raw movement name to its canonical name, family and implement.
 *
 * A slash in a movement name means two different things and they need opposite
 * handling:
 *   - "Rings / Parallettes Dips"     — one movement, a choice of equipment.
 *   - "Push Press / Thruster"        — TWO movements the board alternates between,
 *                                      collapsed into one row upstream.
 *
 * The tell is whether both sides resolve to different families. When they do, the
 * name describes work we can't attribute, so it resolves to no family and lands in
 * the flag queue rather than silently inflating whichever side matched longest.
 */
export function resolveMovement(rawName: string): ResolvedMovement {
  if (rawName.includes('/')) {
    const sides = rawName.split('/').map(s => s.trim()).filter(Boolean);
    if (sides.length >= 2) {
      const resolved = sides.map(resolveSingle);
      const known = resolved.filter(r => r.familyId !== null);
      const families = new Set(known.map(r => r.familyId));

      if (families.size > 1) {
        const cleaned = titleCase(normalizeMovementKey(rawName));
        return {
          canonicalName: cleaned,
          familyId: null,
          familyLabel: cleaned,
          implement: 'bodyweight',
          variant: null,
          match: 'unknown',
        };
      }
      // One family between them (or none): the slash was an equipment choice.
      if (known.length > 0) return known[0];
    }
  }
  return resolveSingle(rawName);
}

function resolveSingle(rawName: string): ResolvedMovement {
  const normalized = normalizeMovementKey(rawName);
  if (!normalized) {
    return {
      canonicalName: rawName.trim(),
      familyId: null,
      familyLabel: rawName.trim(),
      implement: 'bodyweight',
      variant: null,
      match: 'unknown',
    };
  }

  const words = normalized.split(' ');
  const statedImplement = detectImplement(words);

  const direct = compiled.exact.get(normalized);
  if (direct) return describe(direct, words, statedImplement, 'exact');

  // Modifiers first, so "Alt DB Snatch" still lands on the specific "DB Snatch"
  // entry rather than the generic one.
  const stripped = words.filter(w => !MODIFIER_WORDS.has(w));
  if (stripped.length > 0 && stripped.length !== words.length) {
    const viaStrip = compiled.exact.get(stripped.join(' '));
    if (viaStrip) return describe(viaStrip, words, statedImplement, 'exact');
  }

  // Then implements too. Naming the implement is not ambiguity — "Barbell Good
  // Morning" is exactly a Good Morning — and treating it as a fuzzy match would
  // fill the triage queue with names that need no triage. The implement is not
  // lost: `statedImplement` was read off the raw name and still wins below.
  const bare = stripped.filter(w => !isImplementToken(w));
  if (bare.length > 0 && bare.length !== stripped.length) {
    const viaBare = compiled.exact.get(bare.join(' '));
    if (viaBare) return describe(viaBare, words, statedImplement, 'exact');
  }

  // Implement tokens are dropped here too, to match how the phrase index was
  // built — the implement was already read off the raw name above.
  const base = stripped.length > 0 ? stripped : words;
  const withoutImplement = base.filter(w => !isImplementToken(w));
  const haystack = withoutImplement.length > 0 ? withoutImplement : base;
  for (const candidate of compiled.phraseMatched) {
    if (containsPhrase(haystack, candidate.words)) {
      return describe(candidate.entry, words, statedImplement, 'phrase');
    }
  }

  // Last resort, implement tokens retained. Only reached when the implement-free
  // pass found nothing at all, so it can't outrank a real movement match — it
  // exists for names whose only movement word IS an implement abbreviation
  // ("American KBS"), which the pass above has no way to see.
  if (withoutImplement.length !== base.length) {
    for (const candidate of compiled.phraseMatched) {
      if (containsPhrase(base, candidate.words)) {
        return describe(candidate.entry, words, statedImplement, 'phrase');
      }
    }
  }

  const cleaned = titleCase(normalized);
  return {
    canonicalName: cleaned,
    familyId: null,
    familyLabel: cleaned,
    implement: statedImplement ?? 'bodyweight',
    variant: null,
    match: 'unknown',
  };
}

// ── Compound movements ───────────────────────────────────────────────────────

/**
 * Movements that ARE two other movements, and the families they count toward.
 *
 * A thruster is a front squat welded to a push press: a month of thrusters is a
 * month of squatting AND a month of overhead work, and filing it under a third
 * family of its own hides it from both of the questions it answers. So a compound
 * doesn't get its own ledger row — it lands as a named variant under each of its
 * components ("Squat 807 · Thruster 104"), which is what makes the row's total
 * legible instead of mysterious.
 *
 * The reps ARE counted under both families on purpose. That's not double-counting
 * a total, because the recap has no total: every row answers "how much of THIS
 * pattern did I do", and a thruster is an honest yes to two of them.
 *
 * Only movements whose components are each a full rep of that pattern belong here.
 * A burpee contains something push-up-shaped, but it is not a push-up.
 */
export const COMPOUND_FAMILIES: Partial<Record<MovementFamilyId, readonly MovementFamilyId[]>> = {
  thruster: ['squat', 'shoulder_to_overhead'],
};

/** One family a movement's reps land under, and the sub-line they land on. */
export interface FamilyContribution {
  familyId: MovementFamilyId | null;
  /** Ledger row label. */
  label: string;
  /** Sub-line inside that row, when there is one. */
  variant: string | null;
}

/**
 * Every family a resolved movement counts toward — itself, or its components when
 * it's a compound. One entry for ordinary movements, so callers have one path.
 */
export function contributionsOf(resolved: ResolvedMovement): FamilyContribution[] {
  const components = resolved.familyId === null ? undefined : COMPOUND_FAMILIES[resolved.familyId];
  if (!components || resolved.familyId === null) {
    return [{ familyId: resolved.familyId, label: resolved.familyLabel, variant: resolved.variant }];
  }
  const own = MOVEMENT_FAMILIES[resolved.familyId].label;
  return components.map(familyId => ({
    familyId,
    label: familyLabelFor(familyId, resolved.implement),
    // Named after the compound, so each component row says WHY it went up.
    variant: own,
  }));
}

/** True when `phrase` appears as a consecutive run of whole words in `words`. */
function containsPhrase(words: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0 || phrase.length > words.length) return false;
  outer: for (let i = 0; i <= words.length - phrase.length; i++) {
    for (let j = 0; j < phrase.length; j++) {
      if (words[i + j] !== phrase[j]) continue outer;
    }
    return true;
  }
  return false;
}

function describe(
  entry: MovementRegistryEntry,
  words: readonly string[],
  statedImplement: MovementImplement | null,
  match: 'exact' | 'phrase',
): ResolvedMovement {
  // What the board actually said beats what the entry assumes, which beats the
  // family default — "DB Push Press" is a dumbbell movement even though the
  // shoulder-to-overhead family defaults to barbell.
  const implement = statedImplement ?? entry.implement ?? MOVEMENT_FAMILIES[entry.family].defaultImplement;
  const familyLabel = familyLabelFor(entry.family, implement);

  return {
    canonicalName: entry.canonicalName,
    familyId: entry.family,
    familyLabel,
    implement,
    variant: entry.variant ?? deriveVariant(words, entry),
    match,
  };
}

/**
 * The adjective that survives once the family's own words, the implement and
 * every how-you-did-it modifier are removed. "Russian Kettlebell Swing" under
 * the Swing family leaves "Russian"; "Power Clean" leaves "Power".
 *
 * Returns null rather than guessing when nothing meaningful is left — a blank
 * sub-line is better than a fabricated one.
 */
function deriveVariant(words: readonly string[], entry: MovementRegistryEntry): string | null {
  const familyWords = new Set(
    normalizeMovementKey(MOVEMENT_FAMILIES[entry.family].label).split(' '),
  );
  const canonicalWords = new Set(normalizeMovementKey(entry.canonicalName).split(' '));

  const leftover = words.filter(w =>
    !familyWords.has(w)
    && !MODIFIER_WORDS.has(w)
    && !IMPLEMENT_TOKENS.some(([, tokens]) => tokens.has(w))
    // Words the canonical name shares with the family are structural, not variant.
    && !(familyWords.has(w) && canonicalWords.has(w)),
  );

  return leftover.length > 0 ? titleCase(leftover.join(' ')) : null;
}
