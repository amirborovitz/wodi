/**
 * rowTotals — do a poster's rows add up to the workout's saved totals?
 *
 * The single-truth rule (2026-09-14): a movement's total is answered ONCE, at save, and stored in
 * `workloadBreakdown`. The recap, stats, EP and the poster all read that figure. The poster may
 * still split a movement across rows — "4 × 2" and "4 × 1" clean & jerks are two rows of one
 * stored 12 — but its rows must never add up to anything else. Before this, the poster corrected
 * the stored figure on the way to the screen, the recap read it raw, and 232 thrusters reached a
 * weekly recap for a board of 58 while the poster said 58.
 *
 * Used by the poster harness (every fixture must agree) and the audit (a real-data export).
 */
import { abbreviateMovementForPoster, buildPageArtifactSections, inferTeamSizeFromText, isStrengthPagePart } from '../../src/components/celebration/helpers';
import { movementsForParts } from '../../src/components/celebration/movementResolution';
import type { Exercise, MovementTotal } from '../../src/types';

export type Unit = 'reps' | 'cal' | 'm';

export interface Quantity {
  value: number;
  unit: Unit;
}

const FIELD: Record<Unit, 'totalReps' | 'totalCalories' | 'totalDistance'> = {
  reps: 'totalReps', cal: 'totalCalories', m: 'totalDistance',
};

/** The entry's figure in `unit` — nothing when it holds none in that unit. */
export function quantityOf(total: MovementTotal | undefined, unit: Unit): Quantity | undefined {
  const value = total?.[FIELD[unit]];
  return value ? { value, unit } : undefined;
}

/** "58 total", "3.00 km total", "600m total", "5 × 4 reps" → a comparable quantity. */
export function parseTotalNote(note: string | undefined): Quantity | undefined {
  if (!note) return undefined;
  // A hold's total is a duration ("2:00 total", "3 min total", "40s") — not a count this compares.
  if (/\d+:\d{2}|\d\s*(min|mins|minutes|sec|secs|seconds|s)\b/i.test(note)) return undefined;
  const product = note.match(/^\s*(\d+)\s*[×x]\s*([\d.]+)\s*(cal|m)?\b/i);
  if (product) {
    const unit = product[3]?.toLowerCase();
    return { value: Number(product[1]) * Number(product[2]), unit: unit === 'cal' ? 'cal' : unit === 'm' ? 'm' : 'reps' };
  }
  const match = note.match(/([\d.,]+)\s*(km|m|cal)?\b/i);
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = match[2]?.toLowerCase();
  if (unit === 'km') return { value: Math.round(value * 1000), unit: 'm' };
  if (unit === 'm') return { value, unit: 'm' };
  if (unit === 'cal') return { value, unit: 'cal' };
  return { value, unit: 'reps' };
}

export const sameQuantity = (a: Quantity | undefined, b: Quantity | undefined): boolean =>
  (!a && !b) || (!!a && !!b && a.unit === b.unit && Math.abs(a.value - b.value) < 0.5);

/** What the check reads of a workout — a saved doc, or a poster fixture's trimmed copy of one. */
export interface RowCheckInput {
  exercises: Exercise[];
  workloadBreakdown?: { movements: MovementTotal[] };
  rawText?: string;
  title?: string;
  teamSize?: number;
  partnerWorkout?: boolean;
}

export function sessionTeamSize(workout: Omit<RowCheckInput, 'exercises'>): number | undefined {
  if (workout.teamSize) return workout.teamSize;
  if (workout.partnerWorkout === false) return undefined;
  return inferTeamSizeFromText([workout.title, workout.rawText].filter(Boolean).join('\n'));
}

/** Lowercase, letters and digits only, a trailing plural dropped: "Front Squats" ≡ "front squat". */
const nameKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(es|s)$/, '');

/**
 * The entries a poster row speaks for. A row names its movement by `mineKey` (the entry's own
 * name) or, on a combined line, by display name — "Front Squats + Burpees · 54 each" speaks for
 * BOTH, one figure apiece. Every part of a combined name must match, or the row matches nothing.
 */
function matchRow(mineKey: string | undefined, displayName: string, totalNote: string, entries: MovementTotal[]): MovementTotal[] | null {
  const byName = (name: string): MovementTotal | undefined => {
    const k = nameKey(name);
    return entries.find((m) => nameKey(m.name) === k || (m.originalMovement != null && nameKey(m.originalMovement) === k))
      ?? entries.find((m) => nameKey(abbreviateMovementForPoster(m.name)) === k);
  };
  const direct = [mineKey, displayName].filter((n): n is string => !!n).map(byName).find(Boolean);
  if (direct) return [direct];
  const parts = displayName.split(/\s+\+\s+/);
  if (parts.length < 2 || !/\beach\b/i.test(totalNote)) return null;
  const matched = parts.map(byName);
  return matched.every(Boolean) ? (matched as MovementTotal[]) : null;
}

export interface RowTotalCheck {
  entry: MovementTotal;
  stored?: Quantity;
  /** What the poster's rows print for this entry, summed across them. */
  rows: Quantity;
}

export interface WorkoutRowCheck {
  /** Every entry some row prints a total for. */
  checked: RowTotalCheck[];
  /** Rows that print a total but match no stored entry — reported, never guessed. */
  unmatched: string[];
}

/** Every stored entry the poster prints a total for, beside what its rows add up to. */
export function checkRowTotals(workout: RowCheckInput): WorkoutRowCheck {
  const stored = workout.workloadBreakdown?.movements ?? [];
  const exercises: Exercise[] = workout.exercises ?? [];
  const rawText = exercises.length === 1 ? workout.rawText : undefined;
  const teamSize = sessionTeamSize(workout);
  const sums = new Map<MovementTotal, Quantity>();
  const unmatched: string[] = [];
  // Every part has a poster page, so every part's rows are checked.
  for (const exercise of exercises) {
    const index = exercises.indexOf(exercise);
    const scoped = movementsForParts(stored, [exercise], [index]);
    const sections = buildPageArtifactSections(exercise, scoped, isStrengthPagePart(exercise), rawText, teamSize);
    for (const row of sections.flatMap((section) => section.rows ?? [])) {
      const quantity = parseTotalNote(row.totalNote);
      if (!quantity) continue;
      const matches = matchRow(row.mineKey, row.name, row.totalNote ?? '', scoped);
      if (!matches) {
        unmatched.push(`${exercise.name}: "${row.primary ?? ''} ${row.name}" → ${row.totalNote}`);
        continue;
      }
      for (const match of matches) {
        const prior = sums.get(match);
        sums.set(match, prior && prior.unit === quantity.unit ? { ...prior, value: prior.value + quantity.value } : quantity);
      }
    }
  }
  const checked = [...sums.entries()].map(([entry, rows]) => ({ entry, rows, stored: quantityOf(entry, rows.unit) }));
  return { checked, unmatched };
}
