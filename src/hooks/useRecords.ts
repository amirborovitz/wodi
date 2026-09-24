import { useCallback, useMemo, useState } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { usePRs } from './usePRs';
import { useWorkouts, type WorkoutWithStats } from './useWorkouts';
import { getCanonicalLiftName } from '../data/exerciseDefinitions';
import { namedWodRunsOf } from '../services/namedWods';
import { personalRecordManualId } from '../services/personalRecordSync';
import { getEffectiveWorkoutDate } from '../utils/workoutDate';
import { fmtTimeSocial } from '../components/celebration/posterFormatters';
import type { PersonalRecord } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// The Records screen's whole data model.
//
// Two kinds of record live here and they come from different places:
//
//   LIFTS      — the `personalRecords` collection. One doc per PR EVENT, so a movement
//                beaten three times keeps three rows: the highest is the record, the rest
//                are the history below it. Those rows are the AUTHORITY for the number
//                shown, and are what lets a record fall BACK when the workout behind it is
//                corrected or deleted (see services/personalRecordSync.ts).
//   BENCHMARKS — never persisted as records at all. A named WOD's best is derived on
//                read from the workouts that logged it. What counts as "the same named
//                workout" is one rule, shared with the celebration and the rematch
//                suggestions: services/namedWods.ts.
//
// That split is also what can and cannot be edited: a LIFT row is a document, so it can be
// added, corrected and deleted by hand. A BENCHMARK is a reading of the workouts behind it,
// so the only way to change one is to change the workout — the screen offers no edit for it.
// ─────────────────────────────────────────────────────────────────────────────

export type RecordKind = 'lift' | 'benchmark';

export interface RecordAttempt {
  id: string;
  value: string;
  date: Date;
  isBest: boolean;
  /**
   * The stored load in kg. Present on lift rows only — a benchmark's score is a clock read
   * off its workout, so there is no number here to hand back to an edit form.
   */
  weight?: number;
}

export interface RecordEntry {
  id: string;
  kind: RecordKind;
  movement: string;
  /** Formatted best — "90kg" for a lift, "4:12" for a for-time benchmark. */
  value: string;
  achievedAt: Date;
  /** Every logged result that moved the record, newest first. */
  history: RecordAttempt[];
  /**
   * How many distinct spellings the board used for this lift before they folded into one
   * canonical bucket ("DB snatch", "Alt DB Snatch", "Dumbbell Snatch"). 1 when nothing merged.
   * Shown so a record that quietly absorbed several names says so rather than looking wrong.
   */
  loggedNames: number;
}

/** What a hand-entered or hand-corrected record carries. */
export interface RecordDraft {
  /** The row being corrected. Omitted for a brand-new record. */
  id?: string;
  movement: string;
  weight: number;
  /** When it was set. Omitted keeps the row's own date — an edit corrects the number, not the day. */
  date?: Date;
}

/** A record set inside this window still reads as news — it earns the star and the count. */
export const FRESH_PR_DAYS = 30;

export interface RecordsData {
  lifts: RecordEntry[];
  benchmarks: RecordEntry[];
  total: number;
  /** How many records across both kinds were set inside FRESH_PR_DAYS. */
  freshCount: number;
  loading: boolean;
  /** True while a hand edit is in flight — the form disables itself against a double tap. */
  saving: boolean;
  /** Lifts only. Writes the row, then re-reads so the screen shows what Firestore holds. */
  saveRecord: (draft: RecordDraft) => Promise<void>;
  /**
   * Lifts only, by each row's OWN id — a movement keeps one row per PR event, so deleting
   * "the deadlift record" means the row on screen. Takes a list so clearing a whole movement
   * is one round of writes and ONE re-read, rather than the board flickering between rows.
   */
  deleteRecords: (ids: readonly string[]) => Promise<void>;
}

/** Full workout history, so a lift trained two years ago still shows every attempt. */
const RECORDS_WORKOUT_LIMIT = 500;

interface BenchmarkSample {
  workoutId: string;
  time: number;
  date: Date;
  seconds: number;
}

function liftKey(name: string): string {
  return getCanonicalLiftName(name).toLowerCase();
}

/**
 * Every logged run of a named workout, bucketed by name. A session holding two named pieces
 * contributes to two buckets — the name lives on the PART, so the row is keyed by the part's
 * own name and timed by the part's own clock (never the session's, which mixes in its siblings).
 */
function collectBenchmarkSamples(
  workouts: readonly WorkoutWithStats[],
): Map<string, { name: string; samples: BenchmarkSample[] }> {
  const buckets = new Map<string, { name: string; samples: BenchmarkSample[] }>();

  for (const workout of workouts) {
    const date = getEffectiveWorkoutDate(workout);
    for (const run of namedWodRunsOf(workout)) {
      const bucket = buckets.get(run.key) ?? { name: run.name, samples: [] };
      bucket.samples.push({
        // A session with two named parts must keep two rows in its history, not one that
        // overwrites the other.
        workoutId: `${workout.id}#${run.exerciseIndex}`,
        time: date.getTime(),
        date,
        seconds: run.seconds,
      });
      buckets.set(run.key, bucket);
    }
  }

  return buckets;
}

function buildLiftRecords(prs: readonly PersonalRecord[]): RecordEntry[] {
  const grouped = new Map<string, PersonalRecord[]>();
  for (const pr of prs) {
    const key = liftKey(pr.movement);
    grouped.set(key, [...(grouped.get(key) ?? []), pr]);
  }

  const entries: RecordEntry[] = [];
  for (const [key, group] of grouped) {
    const best = [...group].sort((a, b) => b.weight - a.weight)[0];
    const history = [...group]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((pr) => ({
        id: pr.id,
        value: `${pr.weight}kg`,
        date: pr.date,
        isBest: pr.id === best.id,
        weight: pr.weight,
      }));

    entries.push({
      id: `lift-${key}`,
      kind: 'lift',
      movement: getCanonicalLiftName(best.movement),
      value: `${best.weight}kg`,
      achievedAt: best.date,
      history,
      loggedNames: new Set(group.map((pr) => pr.movement.trim().toLowerCase())).size,
    });
  }

  return entries.sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime());
}

function buildBenchmarkRecords(workouts: readonly WorkoutWithStats[]): RecordEntry[] {
  const entries: RecordEntry[] = [];

  for (const [key, { name, samples }] of collectBenchmarkSamples(workouts)) {
    const best = [...samples].sort((a, b) => a.seconds - b.seconds)[0];
    const history = [...samples]
      .sort((a, b) => b.time - a.time)
      .map((sample) => ({
        id: sample.workoutId,
        value: fmtTimeSocial(sample.seconds),
        date: sample.date,
        isBest: sample.workoutId === best.workoutId,
      }));

    entries.push({
      id: `benchmark-${key}`,
      kind: 'benchmark',
      movement: name,
      value: fmtTimeSocial(best.seconds),
      achievedAt: best.date,
      history,
      loggedNames: 1,
    });
  }

  return entries.sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime());
}

export function useRecords(): RecordsData {
  const { user } = useAuth();
  const { prs, loading: prsLoading, refresh } = usePRs();
  const { workouts, loading: workoutsLoading } = useWorkouts(RECORDS_WORKOUT_LIMIT);
  const [saving, setSaving] = useState(false);

  const saveRecord = useCallback(async (draft: RecordDraft) => {
    if (!user || !(draft.weight > 0) || !draft.movement.trim()) return;
    setSaving(true);
    try {
      // Correcting a row rewrites THAT row, keeping the date it was set on: an edit fixes what
      // the number should have said, it does not claim the lift happened today. A brand-new
      // hand-entered record takes the stable manual id, so it stays one row per movement
      // however many times it is edited — and, carrying no workoutId, it survives every
      // workout-scoped repair (see personalRecordSync).
      const existing = draft.id ? prs.find((pr) => pr.id === draft.id) : undefined;
      const docId = draft.id ?? personalRecordManualId(user.id, draft.movement);
      await setDoc(doc(db, 'personalRecords', docId), {
        userId: user.id,
        movement: draft.movement,
        weight: draft.weight,
        date: draft.date ?? existing?.date ?? new Date(),
        workoutId: existing?.workoutId ?? '',
      });
      await refresh();
    } catch (err) {
      console.error('Error saving record:', err);
    } finally {
      setSaving(false);
    }
  }, [user?.id, prs, refresh]);

  const deleteRecords = useCallback(async (ids: readonly string[]) => {
    if (!user || ids.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(ids.map((id) => deleteDoc(doc(db, 'personalRecords', id))));
      await refresh();
    } catch (err) {
      console.error('Error deleting records:', err);
    } finally {
      setSaving(false);
    }
  }, [user?.id, refresh]);

  const entries = useMemo(() => {
    const lifts = buildLiftRecords(prs);
    const benchmarks = buildBenchmarkRecords(workouts);
    const cutoff = Date.now() - FRESH_PR_DAYS * 24 * 60 * 60 * 1000;

    return {
      lifts,
      benchmarks,
      total: lifts.length + benchmarks.length,
      freshCount: [...lifts, ...benchmarks]
        .filter((entry) => entry.achievedAt.getTime() >= cutoff).length,
    };
  }, [prs, workouts]);

  return {
    ...entries,
    loading: prsLoading || workoutsLoading,
    saving,
    saveRecord,
    deleteRecords,
  };
}
