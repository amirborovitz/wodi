import { doc, increment, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { removeUndefined } from '../utils/firestoreUtils';
import { auditSeverity, takePendingAudit, type ParseAuditEntry } from './parseAudit';

/**
 * The AI-trust tally, from real boards.
 *
 * `fixtures/parse-baseline.json` freezes how often our passes overrule the model across 12
 * RECORDED boards. This is the other half: the boards nobody thought to record. The ring row that
 * cost a pull-up its bodyweight, and the "400m" read as 400 minutes, were both on a board no
 * fixture resembled — and the console line that named them was printed on a phone, where no one
 * reads consoles.
 *
 * Keyed by FIELD PATH and counted, not appended per workout, for the same reason `flagMovement`
 * is: an append-only log of every occurrence is a firehose, and what triage needs is "which of
 * our passes second-guesses the model most", which is a ranked list.
 *
 * Structural backfills never reach here — `takePendingAudit` only queues the loud ones. On the
 * corpus that is ~33 entries across 10 boards, so a real save writes a handful of docs at most.
 */

const FLAGS_COLLECTION = 'parseFlags';

/**
 * At most this many field docs per save. A board that trips twenty different passes has one
 * problem, not twenty, and the top few name it — while an unbounded loop would put an athlete's
 * next action behind a queue of telemetry, which is exactly how a `movementFlags` burst once
 * stalled a workout delete.
 */
const MAX_FLAGS_PER_SAVE = 10;

/**
 * One failure closes the channel until the next reload. Telemetry must never break a save, nor
 * keep retrying and holding the athlete's own writes behind it — a rules denial, being offline
 * and a blown quota all look the same from here and all have the same right answer: stop.
 */
let flaggingDisabled = false;

/** Serialized, so a burst can't fan out into parallel writes competing with the athlete's. */
let flagChain: Promise<void> = Promise.resolve();

interface FlagContext {
  userId: string;
  workoutId?: string;
  /** The board's title, so triage can find the workout this came from. */
  title?: string;
}

interface FieldFlag {
  key: string;
  severity: string;
  path: string;
  count: number;
  sample: ParseAuditEntry;
}

/** A Firestore doc id for a field path: `override__exercises_movements_name`. */
function flagId(severity: string, path: string): string {
  return `${severity}__${path}`
    .replace(/\[\]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120);
}

/** Long values are a sample, not a record — the workout doc holds the truth. */
function preview(value: unknown): string {
  return JSON.stringify(value ?? null).slice(0, 120);
}

/**
 * Collapse a parse's entries into one row per field, worst first. Indices are dropped so that
 * `movements[0].time` and `movements[3].time` are one finding about one pass.
 */
function collapse(entries: ParseAuditEntry[]): FieldFlag[] {
  const byKey = new Map<string, FieldFlag>();
  for (const entry of entries) {
    const severity = auditSeverity(entry);
    const path = entry.path.replace(/\[\d+\]/g, '[]').replace(/^\./, '');
    const key = flagId(severity, path);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    byKey.set(key, { key, severity, path, count: 1, sample: entry });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count).slice(0, MAX_FLAGS_PER_SAVE);
}

async function writeFlag(flag: FieldFlag, context: FlagContext): Promise<void> {
  if (flaggingDisabled) return;

  try {
    await setDoc(
      doc(db, FLAGS_COLLECTION, flag.key),
      removeUndefined({
        severity: flag.severity,
        fieldPath: flag.path,
        occurrences: increment(flag.count),
        boards: increment(1),
        // The last board that tripped it, so triage starts from a real example rather than a path.
        lastFrom: preview(flag.sample.from),
        lastTo: preview(flag.sample.to),
        lastTitle: context.title,
        lastUserId: context.userId,
        lastWorkoutId: context.workoutId,
        // Neither `firstSeen` nor `status` is written here: a merge write can't set-if-absent, so
        // both would reset on every flag — re-opening an entry triage had already closed. Triage
        // owns `status`; a missing status means untriaged. (Same rule as movementFlags.)
        lastSeen: serverTimestamp(),
      }),
      { merge: true },
    );
  } catch (error) {
    flaggingDisabled = true;
    console.warn('[parseFlags] flagging disabled after failure on', flag.key, error);
  }
}

/**
 * Record what this workout's parse made us overrule, and empty the queue.
 *
 * Called AFTER the workout is saved, and deliberately not awaited: the athlete is looking at their
 * poster by then, and nothing here may delay that or sit in front of their next write.
 *
 * Draining the queue even when flagging is off keeps a disabled channel from handing a later
 * workout the previous one's entries.
 */
export function flagParseOverrides(context: FlagContext): Promise<void> {
  const entries = takePendingAudit();
  if (flaggingDisabled || entries.length === 0) return Promise.resolve();

  for (const flag of collapse(entries)) {
    flagChain = flagChain.then(() => writeFlag(flag, context));
  }
  return flagChain;
}
