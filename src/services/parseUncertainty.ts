import type { ParsedWorkout, ParseUncertainty } from '../types';

/**
 * What the app does about a field the AI said it could not read.
 *
 * THE RULE
 * A blank the AI flagged is a blank the app leaves alone. Post-processing may still backfill every
 * OTHER empty field — that is the sanctioned path and none of it changes here — but where the model
 * said "I couldn't make this out", filling it in is not a backfill, it is a guess wearing a
 * coach's authority. The athlete is asked instead.
 *
 * WHY IT LIVES AT THE BOUNDARY
 * The alternative was a check inside every pass that can write a quantity, which would need
 * touching each of them and would go stale the first time someone added another. Running once,
 * after post-processing, catches every pass that exists and every pass that ever will — the same
 * reason parseAudit.ts observes here rather than at 200 call sites.
 *
 * SCOPE: PER PART, BEFORE THE MERGE
 * The model's paths are indices into ITS OWN response, and parts are structured separately, so
 * `exercises[0]` from part B means B's first exercise — not the session's. Applied per part the
 * indices are exact; `shiftUncertaintyPaths` re-bases them when the parts are merged so a later
 * consumer still knows which exercise an entry belongs to.
 */

/** A path step: either an object key or an array index. */
type PathStep = { key: string } | { index: number };

/** `exercises[0].movements[2].reps` → steps. Returns null for anything malformed. */
function parsePath(path: string): PathStep[] | null {
  const steps: PathStep[] = [];
  // Splitting on "." then peeling "[n]" suffixes keeps this readable and refuses anything odd,
  // which matters because the string comes from a language model.
  for (const segment of path.split('.')) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[\d+\])*)$/.exec(segment);
    if (!match) return null;
    steps.push({ key: match[1] });
    for (const index of match[2].matchAll(/\[(\d+)\]/g)) {
      steps.push({ index: Number(index[1]) });
    }
  }
  return steps.length > 0 ? steps : null;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
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

function clearLeaf(parent: Record<string, unknown> | unknown[], last: PathStep): void {
  if ('key' in last && !Array.isArray(parent)) delete parent[last.key];
}

export interface UncertaintyOutcome {
  workout: ParsedWorkout;
  /** Paths where post-processing had invented a value and it was taken back out. */
  refused: string[];
  /** Paths the model flagged that don't resolve against the response — a bad path, not a bad value. */
  unresolved: string[];
}

/**
 * Take back any value post-processing invented for a field the AI said it could not read.
 *
 * A flagged field the AI ANSWERED anyway is left alone: the model wrote a number and separately
 * noted it was unsure, and deleting the only reading anyone has helps nobody. This only removes
 * values the AI declined to give and a heuristic supplied.
 */
export function refuseGuessesOnUncertainFields(
  asReturnedByAi: ParsedWorkout,
  afterPostProcessing: ParsedWorkout,
): UncertaintyOutcome {
  const flags = asReturnedByAi.uncertain;
  if (!flags || flags.length === 0) {
    return { workout: afterPostProcessing, refused: [], unresolved: [] };
  }

  const workout = structuredClone(afterPostProcessing);
  const refused: string[] = [];
  const unresolved: string[] = [];

  for (const flag of flags) {
    const steps = parsePath(flag.field);
    if (!steps) {
      unresolved.push(flag.field);
      continue;
    }

    const aiSite = resolve(asReturnedByAi, steps);
    const site = resolve(workout, steps);
    if (!aiSite || !site) {
      unresolved.push(flag.field);
      continue;
    }

    // Only a blank the AI left AND post-processing filled. Anything else is not ours to undo.
    if (isEmpty(readLeaf(aiSite.parent, aiSite.last)) && !isEmpty(readLeaf(site.parent, site.last))) {
      clearLeaf(site.parent, site.last);
      refused.push(flag.field);
    }
  }

  // The flags travel with the workout: what the app declined to invent is exactly what it should
  // ask the athlete about, and that question is asked long after this function returns.
  workout.uncertain = flags;

  if (refused.length > 0) {
    console.warn(
      `🙈 UNCERTAIN · refused to invent ${refused.length} field(s) the AI could not read\n`
      + refused.map((path) => {
        const reason = flags.find((flag) => flag.field === path)?.reason ?? '';
        return `  ${path} — ${reason}`;
      }).join('\n')
    );
  }
  if (unresolved.length > 0) {
    console.warn(`🙈 UNCERTAIN · ${unresolved.length} flagged path(s) did not resolve: ${unresolved.join(', ')}`);
  }

  return { workout, refused, unresolved };
}

/**
 * The flags that belong to one exercise, for a screen that only shows that exercise.
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
  return flags.filter((flag) => flag.field.startsWith(`${prefix}.`) || flag.field === prefix);
}

/**
 * Re-base a part's paths onto the merged session, where its exercises start at `exerciseOffset`.
 *
 * Without this an entry from the session's second part would point at the first part's exercise
 * once the parts are merged — the flag would survive, attached to the wrong movement, which is
 * worse than not having it.
 */
export function shiftUncertaintyPaths(
  flags: ParseUncertainty[] | undefined,
  exerciseOffset: number,
): ParseUncertainty[] {
  if (!flags) return [];
  if (exerciseOffset === 0) return flags;
  return flags.map((flag) => ({
    ...flag,
    field: flag.field.replace(/^exercises\[(\d+)\]/, (_, index: string) =>
      `exercises[${Number(index) + exerciseOffset}]`),
  }));
}
