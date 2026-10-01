import { useCallback, useMemo, useState } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { usePRs } from './usePRs';
import { useWorkouts } from './useWorkouts';
import { personalRecordManualId } from '../services/personalRecordSync';
import { buildBenchmarkRecords, buildLiftRecords, type RecordEntry } from '../services/recordEntries';


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
