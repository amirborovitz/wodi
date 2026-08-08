// What the parse actually says a block contains, as readable lines — the movements and their
// prescribed quantities, in board order.
//
// This exists for the post-OCR confirmation step. That screen asks the athlete to approve the
// parse, but showed only the title, a couple of chips and the AI's one-line paraphrase
// ("Pyramid chipper for time with a 35 min cap") — nothing that names a single movement. A parse
// that silently dropped the 800m run the board opens with looked identical to a correct one, so
// the only screen whose job is catching a bad parse could not reveal one. These lines are what it
// needs to show.
//
// Quantities come from the SAME ladderTiers() reading the poster row and the logging input use,
// so the three screens can never narrate three different workouts.

import { ladderTiers, hasSameMovementsEveryRound } from './sectionShape';
import type { ParsedExercise, ParsedMovement, ParsedSectionType } from '../types';

export interface PrescriptionLine {
  /** Movement name, with any "Buy-In: " / "Cash-Out: " prefix lifted into `role`. */
  name: string;
  /** Prescribed quantity as the coach wrote it: "800-600-400m", "40-30-20", "12 cal". Empty
   *  when the board prescribes no number (a "max reps" or unquantified movement). */
  qty: string;
  /** Structural role, when the parse states one — shown as a tag so a once-only movement is not
   *  mistaken for per-round work. */
  role?: 'buy_in' | 'cash_out';
}

/** The number a movement prescribes, whichever metric it is measured in. */
function quantityOf(mov: ParsedMovement | undefined): number | undefined {
  return mov?.reps ?? mov?.calories ?? mov?.distance;
}

/** The unit that number is written in — reps are bare, calories and distance are labelled. */
function unitOf(mov: ParsedMovement): string {
  if (mov.reps != null) return '';
  if (mov.calories != null) return ' cal';
  return mov.unit ?? 'm';
}

/** "800-600-400m" across tiers, "15" when constant, "" when nothing is prescribed. */
function formatQuantities(values: Array<number | undefined>, sample: ParsedMovement): string {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return '';
  const allSame = present.every((v) => v === present[0]);
  return `${allSame ? present[0] : present.join('-')}${unitOf(sample)}`;
}

// openai.ts flattens an explicit buyIn[] into movements[] by prefixing the name; the parse may
// also carry the role as a field. Read both so neither spelling loses the tag.
function splitRole(mov: ParsedMovement): { name: string; role?: 'buy_in' | 'cash_out' } {
  const prefixed = mov.name.match(/^(Buy-In|Cash-Out):\s*(.*)$/i);
  if (prefixed) {
    return {
      name: prefixed[2] || mov.name,
      role: /^buy/i.test(prefixed[1]) ? 'buy_in' : 'cash_out',
    };
  }
  const role = mov.role === 'buy_in' || mov.role === 'cash_out' ? mov.role : undefined;
  return { name: mov.name, ...(role ? { role } : {}) };
}

function sectionRole(type: ParsedSectionType | undefined): 'buy_in' | 'cash_out' | undefined {
  return type === 'buy_in' || type === 'cash_out' ? type : undefined;
}

function toLine(mov: ParsedMovement, qty: string, fallbackRole?: 'buy_in' | 'cash_out'): PrescriptionLine {
  const { name, role } = splitRole(mov);
  const resolved = role ?? fallbackRole;
  return { name, qty, ...(resolved ? { role: resolved } : {}) };
}

export function buildPrescriptionLines(exercise: ParsedExercise): PrescriptionLine[] {
  // A per-movement ladder repeats the same movements every tier with their own schemes, so it
  // reads as ONE line per movement carrying the whole scheme — not the same four names three
  // times over. Matches how the poster and the logging screen tell it.
  const shape = ladderTiers(exercise);
  if (shape && hasSameMovementsEveryRound(exercise)) {
    const first = shape.tiers[0];
    return first.map((mov, j) =>
      toLine(mov, formatQuantities(shape.tiers.map((tier) => quantityOf(tier[j])), mov)));
  }

  // Sectioned but not a ladder (buy-in → rounds → cash-out, a building chipper): walk the
  // sections in board order so a once-only block keeps its place and its tag.
  const sections = exercise.sections;
  if (sections && sections.length > 0) {
    return sections.flatMap((section) =>
      (section.movements ?? []).map((mov) =>
        toLine(mov, formatQuantities([quantityOf(mov)], mov), sectionRole(section.sectionType))));
  }

  return (exercise.movements ?? []).map((mov) =>
    toLine(mov, formatQuantities([quantityOf(mov)], mov)));
}
