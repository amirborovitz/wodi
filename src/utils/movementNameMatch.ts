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
