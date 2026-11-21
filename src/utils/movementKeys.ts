import type { ParsedMovement } from '../types';

/**
 * Generate unique keys for a movements array.
 * If a name appears more than once, subsequent occurrences get a "::1", "::2" suffix.
 * Unique names keep their plain name as key.
 */
export function getMovementKeys(movements: ParsedMovement[]): string[] {
  const counts = new Map<string, number>();
  // First pass: count occurrences
  for (const m of movements) {
    counts.set(m.name, (counts.get(m.name) || 0) + 1);
  }
  // Second pass: assign keys
  const seen = new Map<string, number>();
  return movements.map(m => {
    const total = counts.get(m.name) || 1;
    if (total === 1) return m.name; // unique — no suffix
    const idx = seen.get(m.name) || 0;
    seen.set(m.name, idx + 1);
    return idx === 0 ? m.name : `${m.name}::${idx}`;
  });
}

/**
 * Look up a value from a name-keyed map using a movement key.
 * Tries the full key first, falls back to plain name (for backward compat with saved data).
 */
export function movementLookup<T>(map: Record<string, T>, key: string, plainName: string): T | undefined {
  return map[key] ?? (key !== plainName ? map[plainName] : undefined);
}
