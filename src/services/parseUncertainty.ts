import type { ParsedWorkout, ParseUncertainty } from '../types';

/**
 * Questions about a board: a field the reader could not settle, and the athlete's answer written
 * into it. Parses carry these as `ParsedWorkout.uncertain` — the chat asks the askable ones and
 * `answerUncertainty` writes the reply into the very field the flag names.
 */

/** A path step: either an object key or an array index. */
type PathStep = { key: string } | { index: number };

/** An array index that means "every item" — the reader's `buyIn[*]` / `movements[]`. */
const EVERY = -1;

/**
 * `exercises[0].movements[2].reps` → steps. Returns null for anything malformed. `[*]` or `[]` is
 * EVERY item — one question about several movements at once ("how was the buy-in shared?").
 */
function parsePath(path: string): PathStep[] | null {
  const steps: PathStep[] = [];
  // Splitting on "." then peeling "[n]" suffixes keeps this readable and refuses anything odd,
  // which matters because the string comes from a language model.
  for (const segment of path.split('.')) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[(?:\d+|\*)?\])*)$/.exec(segment);
    if (!match) return null;
    steps.push({ key: match[1] });
    for (const index of match[2].matchAll(/\[(\d+|\*)?\]/g)) {
      steps.push({ index: index[1] && index[1] !== '*' ? Number(index[1]) : EVERY });
    }
  }
  return steps.length > 0 ? steps : null;
}

/** Walk to a path's container and read the leaf. Returns null when the path doesn't exist. */
function resolve(root: unknown, steps: PathStep[]): { parent: Record<string, unknown> | unknown[]; last: PathStep } | null {
  let node: unknown = root;
  for (const step of steps.slice(0, -1)) {
    if ('key' in step) {
      if (typeof node !== 'object' || node === null || Array.isArray(node)) return null;
      node = (node as Record<string, unknown>)[step.key];
    } else {
      if (!Array.isArray(node)) return null;
      node = node[step.index];
    }
  }
  if (typeof node !== 'object' || node === null) return null;
  return { parent: node as Record<string, unknown> | unknown[], last: steps[steps.length - 1] };
}

function readLeaf(parent: Record<string, unknown> | unknown[], last: PathStep): unknown {
  if ('key' in last) return Array.isArray(parent) ? undefined : parent[last.key];
  return Array.isArray(parent) ? parent[last.index] : undefined;
}

/** An option's value is JSON as the reader wrote it; a bare word is kept as text. */
function optionValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function writeLeaf(parent: Record<string, unknown> | unknown[], last: PathStep, value: unknown): void {
  if ('key' in last && !Array.isArray(parent)) parent[last.key] = value;
  else if ('index' in last && Array.isArray(parent)) parent[last.index] = value;
}

/**
 * The flags that belong to one exercise and were UNREADABLE, for a screen that only shows that
 * exercise. Missing and ambiguous flags are questions the chat asks, not warnings about the board.
 *
 * Session-level flags (`timeCap`, `sourceDate`) belong to no exercise and are deliberately not
 * returned: a part's own screen should not carry a warning about the board's date.
 */
export function uncertaintyForExercise(
  flags: ParseUncertainty[] | undefined,
  exerciseIndex: number,
): ParseUncertainty[] {
  if (!flags) return [];
  const prefix = `exercises[${exerciseIndex}]`;
  return flags.filter((flag) => (flag.kind ?? 'unreadable') === 'unreadable'
    && (flag.field.startsWith(`${prefix}.`) || flag.field === prefix));
}

// ─── Asking about it ─────────────────────────────────────────────

/** Every field a flag's answer goes into: its targets when it covers several, else its own. */
function fieldsOf(flag: ParseUncertainty): string[] {
  return flag.targets ?? [flag.field];
}

/** The flags the athlete can be asked about — a question, a way to answer it, and for a choice its options. */
export function askableUncertainty(workout: ParsedWorkout | null | undefined): ParseUncertainty[] {
  return (workout?.uncertain ?? []).filter((flag) => Boolean(
    flag.question && flag.answer && (flag.answer !== 'choice' || (flag.options?.length ?? 0) > 0),
  ));
}

/** What the athlete said, in the shapes the chat reads answers in. */
export interface UncertaintyReply {
  seconds: number | null;
  count: number | null;
  /** A 'choice': the option's label. */
  choice: string | null;
}

/**
 * The value an answer writes into the flagged field, or undefined when the reply doesn't answer it
 * ("not sure"). A choice writes its option's value exactly as the model gave it (JSON) — the app
 * never decides what "we split it" means for the field; the model that asked already said.
 */
export function uncertaintyValue(flag: ParseUncertainty, reply: UncertaintyReply): unknown {
  switch (flag.answer) {
    case 'duration': return reply.seconds ?? undefined;
    case 'number': return reply.count ?? undefined;
    case 'choice': {
      const option = flag.options?.find((o) => o.label === reply.choice);
      return option ? optionValue(option.value) : undefined;
    }
    default: return undefined;
  }
}

/**
 * The athlete settled a flag: its value goes into the very field the model named, and the flag is
 * done — never asked again, here or when the board is reopened. `value` undefined is "not sure":
 * the flag is closed and the field keeps what it had. Everything downstream (totals, poster, EP)
 * reads the field as it always does, so no consumer knows or cares that it was asked.
 */
export function answerUncertainty(workout: ParsedWorkout, field: string, value: unknown): ParsedWorkout {
  const next = structuredClone(workout);
  const flag = next.uncertain?.find((f) => f.field === field);
  for (const path of value === undefined ? [] : flag ? fieldsOf(flag) : [field]) {
    const steps = parsePath(path);
    // The answer was checked against the field when the flag came in (fitAnswerToSchema). One
    // more guard, because the workout is the athlete's: a plain value never replaces an object.
    const site = steps ? resolve(next, steps) : null;
    const current = site ? readLeaf(site.parent, site.last) : undefined;
    if (site && (current == null || typeof current !== 'object')) writeLeaf(site.parent, site.last, value);
  }
  const rest = (next.uncertain ?? []).filter((flag) => flag.field !== field);
  if (rest.length > 0) next.uncertain = rest;
  else delete next.uncertain;
  return next;
}
