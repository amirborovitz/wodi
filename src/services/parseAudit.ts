/**
 * Where the app overruled the AI's reading of a board — as a list, from real boards.
 *
 * The rule is that the AI reads the board and the app never second-guesses it. Since the recipe
 * reader there is exactly one place the app's answer is kept over the model's: a part whose stated
 * totals still disagree with its own recipe after a second reading. The recipe's arithmetic wins
 * (the model reads structure reliably and adds unreliably), and that is recorded here so it is
 * never silent:
 *
 *   - `fixtures/parse-baseline.json` freezes how often the corpus boards trip it, and the corpus
 *     fails on a new one;
 *   - `parseFlagService` ranks what real boards trip, drained from the pending queue at save.
 *
 * It only observes. Nothing here changes a value.
 */

export type ParseAuditKind = 'backfill' | 'override';

export interface ParseAuditEntry {
  /** What was overruled, e.g. `recipe.totals.Echo Bike`. */
  path: string;
  kind: ParseAuditKind;
  /** What the AI said. */
  from: unknown;
  /** What the app kept in its place. */
  to: unknown;
}

/**
 * How loudly an entry is read. Every override is loud. The backfill severities remain for entries
 * saved by the old reader's post-processor, which telemetry still ranks under the same ids.
 */
export type ParseAuditSeverity = 'override' | 'quantity-backfill' | 'structural-backfill';

export function auditSeverity(entry: ParseAuditEntry): ParseAuditSeverity {
  return entry.kind === 'override' ? 'override' : 'structural-backfill';
}

/** Loud entries are the ones that need a reason. */
export function isLoudEntry(entry: ParseAuditEntry): boolean {
  return auditSeverity(entry) !== 'structural-backfill';
}

/**
 * Every audit this session has produced, newest last — one list per overruled part. Read it from
 * devtools as `wodiParseAudit`; the corpus scripts read the same tally in Node.
 */
const auditLog: ParseAuditEntry[][] = [];

export interface ParseAuditView {
  /** Every overruled part this session, newest last. */
  all: ParseAuditEntry[][];
  /** Every override across every part. */
  overrides: () => ParseAuditEntry[];
  /** Override counts by path, worst first. */
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
 * Capped: a pathological board must not grow this without bound.
 */
const MAX_PENDING = 50;
let pending: ParseAuditEntry[] = [];

function overrides(): ParseAuditEntry[] {
  return auditLog.flat().filter(isLoudEntry);
}

function byField(): Array<{ path: string; count: number }> {
  const counts = new Map<string, number>();
  overrides().forEach((entry) => counts.set(entry.path, (counts.get(entry.path) ?? 0) + 1));
  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * A part whose stated totals still disagreed with its own recipe after a second reading: the
 * recipe's arithmetic was kept over the model's sum.
 */
export function recordTotalsOverruled(
  disagreements: ReadonlyArray<{ movement: string; side?: string; stated: number; fromRecipe?: number }>,
): void {
  const entries: ParseAuditEntry[] = disagreements.map((d) => ({
    path: `recipe.totals.${d.movement}${d.side ? `.${d.side}` : ''}`,
    kind: 'override',
    from: d.stated,
    to: d.fromRecipe,
  }));
  auditLog.push(entries);
  globalThis.wodiParseAudit = { all: auditLog, overrides, byField };
  pending = [...pending, ...entries].slice(0, MAX_PENDING);
  console.warn(
    `⚠️ AI-OVERRIDE · the AI's own totals did not add up; the recipe's arithmetic was kept\n`
    + entries.map((e) => `  ${e.path}: ${JSON.stringify(e.from)} → ${JSON.stringify(e.to)}`).join('\n'),
  );
}

/** Takes the queue and empties it. Safe to call when nothing parsed — returns []. */
export function takePendingAudit(): ParseAuditEntry[] {
  const taken = pending;
  pending = [];
  return taken;
}
