import type { ParsedWorkout, ParseUncertainty } from '../types';
import { PARSE_RESPONSE_SCHEMA } from './parseSchema';

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

function writeLeaf(parent: Record<string, unknown> | unknown[], last: PathStep, value: unknown): void {
  if ('key' in last && !Array.isArray(parent)) parent[last.key] = value;
  else if ('index' in last && Array.isArray(parent)) parent[last.index] = value;
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

  for (const path of flags.flatMap(fieldsOf)) {
    const steps = parsePath(path);
    if (!steps) {
      unresolved.push(path);
      continue;
    }

    const aiSite = resolve(asReturnedByAi, steps);
    const site = resolve(workout, steps);
    if (!aiSite || !site) {
      unresolved.push(path);
      continue;
    }

    // Only a blank the AI left AND post-processing filled. Anything else is not ours to undo.
    if (isEmpty(readLeaf(aiSite.parent, aiSite.last)) && !isEmpty(readLeaf(site.parent, site.last))) {
      clearLeaf(site.parent, site.last);
      refused.push(path);
    }
  }

  // The flags travel with the workout: what the app declined to invent is exactly what it should
  // ask the athlete about, and that question is asked long after this function returns.
  workout.uncertain = flags;

  if (refused.length > 0) {
    console.warn(
      `🙈 UNCERTAIN · refused to invent ${refused.length} field(s) the AI could not read\n`
      + refused.map((path) => {
        const reason = flags.find((flag) => fieldsOf(flag).includes(path))?.reason ?? '';
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

type SchemaNode = Record<string, unknown>;

/** The schema node a path lands on in the parse response, or null when the path isn't in it. */
function schemaAt(steps: PathStep[]): SchemaNode | null {
  const unwrap = (node: SchemaNode | undefined): SchemaNode | undefined => {
    const variants = node?.anyOf as SchemaNode[] | undefined;
    return variants ? variants.find((v) => v.type !== 'null') : node;
  };
  let node = unwrap(PARSE_RESPONSE_SCHEMA.schema as SchemaNode);
  for (const step of steps) {
    if (!node) return null;
    node = 'key' in step
      ? unwrap((node.properties as Record<string, SchemaNode> | undefined)?.[step.key])
      : unwrap(node.items as SchemaNode | undefined);
  }
  return node ?? null;
}

/**
 * Can this value go in this field? Read off the same schema the reader answers in, so it holds for
 * every field there is or will be. An answer is one plain value — a number, a word from the field's
 * own list, yes/no — and it may only land where that kind of value lives: a number aimed at a field
 * that holds a whole object would corrupt the workout (palindrome-partner-chipper, 2026-10-14).
 */
function fieldAccepts(field: string, value: unknown): boolean {
  const steps = parsePath(field);
  const node = steps ? schemaAt(steps) : null;
  if (!node) return false;
  const enumValues = node.enum as unknown[] | undefined;
  if (enumValues && !enumValues.includes(value)) return false;
  switch (node.type) {
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    default: return false;
  }
}

/** A choice option's value as the reader wrote it (JSON), or the bare text. */
function optionValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * A flag as the reader returned it, kept askable only when its answer fits the field it names —
 * checked in the READER'S layout, the one its paths are written in. A choice keeps only the options
 * its field can hold; a flag whose answer fits nowhere keeps its reason and loses its question.
 */
export function fitAnswerToSchema(flag: ParseUncertainty): ParseUncertainty {
  if (!flag.question || !flag.answer) return flag;
  const { question: _q, answer: _a, options: _o, ...unaskable } = flag;
  if (flag.answer === 'choice') {
    const options = (flag.options ?? []).filter((o) => fieldAccepts(flag.field, optionValue(o.value)));
    return options.length > 0 ? { ...flag, options } : unaskable;
  }
  // A length of time or a count is a number; the field has to hold one.
  return fieldAccepts(flag.field, flag.answer === 'number' ? 1 : 60) ? flag : unaskable;
}

/** How one part's movements were laid out in the reader's reply. */
export interface PartLayout {
  /** Movements in its `buyIn` list. */
  buyIn: number;
  /** Movements in its `movements` list. */
  core: number;
  /** Movements in its `cashOut` list. */
  cashOut: number;
}

/**
 * The reader's paths, moved into the app's layout. The reply lists a part's buy-in, its rounds and
 * its cash-out separately; the app keeps them as ONE movements[] in that order — so the reply's
 * `movements[4]` is not the app's. Left untranslated, KICK START's "which machine for the 30
 * calories?" would have renamed its box jumps. And the reply's `share` is the app's `together`
 * (validateMovement): "each" and "together" are true, "split" is false.
 */
export function toAppLayout(flags: ParseUncertainty[] | undefined, layouts: PartLayout[]): ParseUncertainty[] | undefined {
  if (!flags) return undefined;
  return flags.map((flag) => {
    const m = /^exercises\[(\d+)\]\.(buyIn|movements|cashOut)\[(\d+|\*)?\](.*)$/.exec(flag.field);
    const layout = m ? layouts[Number(m[1])] : undefined;
    if (!m || !layout) return flag;
    const [start, count] = m[2] === 'buyIn' ? [0, layout.buyIn]
      : m[2] === 'movements' ? [layout.buyIn, layout.core]
      : [layout.buyIn + layout.core, layout.cashOut];
    const isShare = m[4] === '.share';
    const leaf = isShare ? '.together' : m[4];
    const at = (index: number): string => `exercises[${m[1]}].movements[${index}]${leaf}`;
    const one = m[3] != null && m[3] !== '*';
    const shareOptions = isShare && flag.options
      ? { options: flag.options.map((o) => ({ ...o, value: JSON.stringify(optionValue(o.value) !== 'split') })) }
      : {};
    // One movement: its path in the app. Every movement of a list: the flag keeps the reader's
    // words as its name and lists where the answer goes — one question, one answer, all of them.
    return one
      ? { ...flag, field: at(start + Number(m[3])), ...shareOptions }
      : { ...flag, targets: Array.from({ length: count }, (_, i) => at(start + i)), ...shareOptions };
  });
}

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
  const shift = (path: string): string => path.replace(/^exercises\[(\d+)\]/, (_, index: string) =>
    `exercises[${Number(index) + exerciseOffset}]`);
  return flags.map((flag) => ({
    ...flag,
    field: shift(flag.field),
    ...(flag.targets ? { targets: flag.targets.map(shift) } : {}),
  }));
}
