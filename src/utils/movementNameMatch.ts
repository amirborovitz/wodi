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
