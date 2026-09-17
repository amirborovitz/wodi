import type { ParsedWorkout } from '../types';

/**
 * What the post-processor did to the AI's answer, field by field.
 *
 * WHY THIS EXISTS
 * The rule has always been that post-processing may BACKFILL a field the AI left empty and must
 * never OVERRIDE one it filled — CrossFit has too many formats for our heuristics to out-argue the
 * model. But nothing ever checked. The post-processor is ~2,800 lines across dozens of passes, and
 * "we probably over-parse" was a feeling with no list behind it.
 *
 * This produces the list. It diffs the parse as it arrived against the parse as it left, and reads
 * every leaf difference at one of three volumes (see `auditSeverity`):
 *
 *   override            — the AI gave an answer and we replaced it. A bug in a pass or a gap in
 *                         the prompt; there is no third option.
 *   quantity-backfill   — the AI left a field IT OWNS empty and we filled it. The same thing: a
 *                         strict structured output answers every field, so a blank means THERE IS
 *                         NONE. This bucket was invented on 16/09 because the previous rule filed
 *                         it under "sanctioned" and a poster printed "400 min Pull-ups".
 *   structural-backfill — plumbing the model has no opinion about. Sanctioned; logged quietly.
 *
 * ONE OBSERVER, NOT 200 CALL SITES. Instrumenting every assignment would mean touching every pass
 * and would go stale the moment someone adds one. Diffing the boundary catches every pass that
 * exists and every pass that ever will, and it cannot drift from what actually happened.
 *
 * It only observes. Nothing here changes a value, and removing it changes no behaviour. What acts
 * on the list lives elsewhere: `fixtures/parse-baseline.json` fails the corpus when a new entry
 * appears, and `parseFlagService` ranks what real boards trip.
 */

export type ParseAuditKind = 'backfill' | 'override';

export interface ParseAuditEntry {
  /** Dotted path into the workout, e.g. `exercises[1].movements[0].reps`. */
  path: string;
  kind: ParseAuditKind;
  /** What the AI returned. `undefined` on a backfill, by definition. */
  from: unknown;
  /** What post-processing left in its place. */
  to: unknown;
}

/**
 * Fields the MODEL owns: what the board prescribed, and what the athlete will therefore be asked.
 *
 * The distinction this file was built on — "we only filled a blank" — stopped being true when the
 * parse became a strict structured output. Every field is now answered on every movement, so a
 * blank is not silence, it is the model saying THERE IS NONE. Filling one is overruling it with
 * extra steps, and the 15/09 board proves the cost: `time` was blank on a ring row because there
 * was no time, a pass filled it from the next line's "400m", and the poster printed "400 min
 * Pull-ups" while this audit counted it as sanctioned.
 *
 * Everything not listed here is plumbing the model has no opinion about (`countingMode`,
 * `stationIndex`, `scoreEntryMode`) — filling those is the sanctioned path and stays quiet.
 */
const MODEL_OWNED_FIELDS: ReadonlySet<string> = new Set([
  'name', 'reps', 'repsDisplay', 'distance', 'calories', 'time', 'unit',
  'rxWeights', 'rxCalories', 'inputType', 'equipment', 'implementCount',
  'isMaxReps', 'maxMetric', 'alternative', 'together', 'teamSize', 'timeCap',
]);

/**
 * How loudly an entry should be read.
 *   override            — the model answered and we replaced it.
 *   quantity-backfill   — the model left a field IT OWNS blank and we filled it. Same thing.
 *   structural-backfill — plumbing the model doesn't own. Sanctioned.
 */
export type ParseAuditSeverity = 'override' | 'quantity-backfill' | 'structural-backfill';

export function auditSeverity(entry: ParseAuditEntry): ParseAuditSeverity {
  if (entry.kind === 'override') return 'override';
  const leaf = entry.path.split('.').pop()?.replace(/\[\d+\]$/, '') ?? '';
  return MODEL_OWNED_FIELDS.has(leaf) ? 'quantity-backfill' : 'structural-backfill';
}

/** Loud entries are the ones that need a reason: an override, or a blank the model owns. */
export function isLoudEntry(entry: ParseAuditEntry): boolean {
  return auditSeverity(entry) !== 'structural-backfill';
}

/** An "empty" value is one the AI declined to fill — filling it is a backfill, not an override. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function classify(path: string, from: unknown, to: unknown, out: ParseAuditEntry[]): void {
  if (from === to) return;

  if (Array.isArray(from) && Array.isArray(to)) {
    // Length changes are structural — a pass rebuilt the list (an interleaved chipper being
    // un-collapsed, a movements[] synthesised from prescription text). Worth one entry naming the
    // array rather than a diff per shifted index, which would bury the real event in noise.
    if (from.length !== to.length) {
      out.push({ path, kind: from.length === 0 ? 'backfill' : 'override', from: from.length, to: to.length });
      return;
    }
    from.forEach((item, index) => classify(`${path}[${index}]`, item, to[index], out));
    return;
  }

  if (isPlainObject(from) && isPlainObject(to)) {
    const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
    keys.forEach((key) => classify(path ? `${path}.${key}` : key, from[key], to[key], out));
    return;
  }

  // Leaf. Two objects of different shapes land here too, which is correct: that IS a replacement.
  if (isAbsent(from)) {
    if (!isAbsent(to)) out.push({ path, kind: 'backfill', from, to });
    return;
  }
  out.push({ path, kind: 'override', from, to });
}

/**
 * Every field post-processing changed, classified. Pure — safe to call on any two parses.
 */
export function diffParse(before: ParsedWorkout, after: ParsedWorkout): ParseAuditEntry[] {
  const entries: ParseAuditEntry[] = [];
  classify('', before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, entries);
  return entries;
}

/**
 * Every audit this session has produced, newest last. The point of the exercise is a list built
 * from REAL boards, so it has to survive past the console line that announced it — filter the
 * console and you only see what scrolled by.
 *
 * Read it from devtools as `wodiParseAudit`.
 */
const auditLog: ParseAuditEntry[][] = [];

export interface ParseAuditView {
  /** Every parse this session, newest last. */
  all: ParseAuditEntry[][];
  /** Every override across every parse — the list this whole module exists to produce. */
  overrides: () => ParseAuditEntry[];
  /** Override counts by field path, worst first: which passes to look at, in order. */
  byField: () => Array<{ path: string; count: number }>;
}

declare global {
  // eslint-disable-next-line no-var
  var wodiParseAudit: ParseAuditView | undefined;
  interface Window {
    wodiParseAudit?: ParseAuditView;
  }
}

/**
 * Loud entries not yet handed to telemetry, drained by the save path (see parseFlagService).
 *
 * A queue rather than "the last parse" because a segmented board parses once per PART, so the
 * entries for one workout arrive as several audits. Capped: a pathological board must not grow
 * this without bound, and the tail of a 200-entry parse says nothing the first 50 didn't.
 */
const MAX_PENDING = 50;
let pending: ParseAuditEntry[] = [];

/** Takes the queue and empties it. Safe to call when nothing parsed — returns []. */
export function takePendingAudit(): ParseAuditEntry[] {
  const taken = pending;
  pending = [];
  return taken;
}

function overrides(): ParseAuditEntry[] {
  return auditLog.flat().filter(isLoudEntry);
}

function byField(): Array<{ path: string; count: number }> {
  const counts = new Map<string, number>();
  overrides().forEach((entry) => {
    // Collapse indices so `exercises[0].movements[2].reps` and `exercises[1].movements[0].reps`
    // count as the same finding — the question is which FIELD we keep overruling, not which board.
    const key = entry.path.replace(/\[\d+\]/g, '[]');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Diff one parse, record it, and say what happened in the console.
 *
 * Overrides print loudly and individually because each one is a defect waiting to be triaged.
 * Backfills print as a single count: they are the sanctioned path, and listing them would bury
 * the overrides in exactly the noise this is meant to cut through.
 */
export function auditPostProcess(before: ParsedWorkout, after: ParsedWorkout): ParseAuditEntry[] {
  const entries = diffParse(before, after);
  auditLog.push(entries);

  // On globalThis, not just window, so the corpus scripts can read the same tally in Node.
  globalThis.wodiParseAudit = { all: auditLog, overrides, byField };

  const loud = entries.filter(isLoudEntry);
  const structural = entries.length - loud.length;
  pending = [...pending, ...loud].slice(0, MAX_PENDING);

  if (loud.length === 0) {
    console.info(`🤝 AI-OVERRIDE · none — ${structural} structural field(s) filled, nothing overruled`);
    return entries;
  }

  console.warn(
    `⚠️ AI-OVERRIDE · ${loud.length} field(s) overruled (${structural} structural)\n`
    + loud
      .map((entry) => `  [${auditSeverity(entry)}] ${entry.path}: `
        + `${JSON.stringify(entry.from)} → ${JSON.stringify(entry.to)}`)
      .join('\n')
    + '\n  (window.wodiParseAudit.byField() for the running tally)'
  );
  return entries;
}
