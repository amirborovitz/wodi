/**
 * Word-boundary matching for movement-name pattern lists.
 *
 * Substring matching (`name.includes('run')`) also matches INSIDE longer words:
 * "Bicycle Crunch" contains "run", so every crunch was classified as distance cardio
 * and logged in meters. Same trap for 'du' inside "dumbbell", 'row' inside "throw",
 * 'dip' inside "dipping", 'su' inside "sumo".
 *
 * Every classifier that maps a movement NAME to a kind/inputType/color must go through
 * here so a pattern only matches a whole word (simple plurals tolerated:
 * "burpee" → "burpees", "crunch" → "crunches"). Multi-word patterns match on the whole
 * phrase; internal spaces also tolerate a hyphen ("ski erg" matches "Ski-Erg").
 */

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const patternCache = new Map<string, RegExp>();

function patternToRegex(pattern: string): RegExp {
  const cached = patternCache.get(pattern);
  if (cached) return cached;
  const body = escapeRegex(pattern.trim()).replace(/\\?\s+/g, '[\\s-]+');
  const regex = new RegExp(`\\b${body}(?:e?s)?\\b`, 'i');
  patternCache.set(pattern, regex);
  return regex;
}

/** True when `name` contains any of `patterns` as a whole word/phrase. */
export function matchesNamePattern(name: string, patterns: readonly string[]): boolean {
  return patterns.some(p => patternToRegex(p).test(name));
}

/** Words that say which machine, or how much of it — never which movement. */
const ROW_ERG_WORDS = new Set([
  'row', 'rows', 'rowing', 'rower', 'rowerg', 'erg', 'machine', 'concept', 'concept2', 'c2',
  'cal', 'cals', 'calorie', 'calories', 'm', 'meter', 'meters', 'metre', 'metres', 'km', 'max',
]);

/**
 * True when a name is the rowing MACHINE. "Row" names the erg only when nothing else in the name
 * says which row: Ring Row, Renegade Row, Gorilla Row, Upright Row are rows of a body or a
 * weight. A whole-word match on "row" filed every one of them as the erg — so a ring row was
 * handed the shared barbell weight and a "400m" off the next line read as 400 minutes.
 *
 * The ONE place that decides it. Pattern lists must not carry a bare 'row'.
 */
export function isRowErgName(name: string): boolean {
  const words = name
    .toLowerCase()
    .replace(/^\s*(?:buy[\s-]?in|cash[\s-]?out)\s*:\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    // Quantities ("500m", "20", "2") say how much, not what.
    .filter((word) => word && !/^\d+[a-z]*$/.test(word));
  return words.some((word) => /^row(?:s|ing|er|erg)?$/.test(word))
    && words.every((word) => ROW_ERG_WORDS.has(word));
}

const MOVEMENT_TOKEN_ALIASES: Record<string, string> = {
  db: 'dumbbell',
  kb: 'kettlebell',
  bb: 'barbell',
  alt: 'alternating',
};

function singularizeMovementToken(word: string): string {
  if (word.length <= 2 || word.endsWith('ss')) return word;
  if (/(sses|ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2); // presses → press
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

/**
 * A movement name reduced to comparable tokens: lowercased, split on spaces and hyphens,
 * singularized, short abbreviations expanded ("DB" → "dumbbell").
 *
 * Boards and the parser spell the same movement several ways — "Chest to Bar Pull-up" and
 * "Chest-to-Bar Pull-ups" are one movement — so anything comparing two movement NAMES has to
 * compare these tokens, never the raw strings.
 */
export function movementNameTokens(value: string): string[] {
  const stop = new Set(['and', 'the', 'with', 'for', 'time', 'rounds', 'round']);
  return value
    .toLowerCase()
    .replace(/&|\+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((word) => word.length > 1 && !stop.has(word))
    .map((word) => {
      const singular = singularizeMovementToken(word);
      return MOVEMENT_TOKEN_ALIASES[singular] ?? singular;
    });
}

/** True when two names denote the same movement, whatever their spelling or plural. */
export function sameMovementName(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = movementNameTokens(a);
  const right = movementNameTokens(b);
  return left.length > 0 && left.length === right.length && left.every((w, i) => w === right[i]);
}

/**
 * A movement name with its structural ROLE prefix removed — "Cash-out: Core" → "Core".
 *
 * The parser sometimes writes where a movement sits into the movement's own name. The poster
 * already carries that fact elsewhere (a BUY-IN / BUY-OUT section header, a page of its own), so
 * printing it again inside the row says the same thing twice and reads as part of the lift.
 *
 * A NAME and nothing else. It never decides a kind, a quantity or a route — those belong to the
 * model's answer, not to a prefix somebody typed.
 */
export function stripMovementRolePrefix(name: string): string {
  return name.replace(/^\s*(?:buy[-\s]?in|cash[-\s]?out|buy[-\s]?out)\s*:\s*/i, '').trim() || name.trim();
}
