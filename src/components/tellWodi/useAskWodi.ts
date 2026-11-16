import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchPersonalRecords } from '../../hooks/usePRs';
import { askWodi, type AskSituation, type AskWodiReply } from '../../services/wodiAgent/askWodi';
import type { ChatTurn } from '../../services/tellWodiReader';
import type { TrainingContext } from '../../services/wodiAgent/trainingFacts';
import { DEFAULT_BW } from '../../utils/xpCalculations';
import type { PersonalRecord, Workout } from '../../types';

/** `situation`: between workouts (default), logging a board, or heading into one (its game plan). */
export type AskFn = (message: string, recent: ChatTurn[], situation?: AskSituation) => Promise<AskWodiReply>;

/**
 * Ask Wodi, wired to this athlete's log: the workouts already loaded for the screen, and their
 * records — read from Firestore only the first time a question needs the log, since most first
 * messages are workouts and never touch it. A body weight they tell Wodi is saved to their profile
 * here, so every way into Ask Wodi keeps it the same way.
 */
export function useAskWodi(workouts: readonly Workout[]): AskFn {
  const { user, updateUserProfile } = useAuth();
  const latest = useRef({ workouts, user, updateUserProfile });
  useEffect(() => { latest.current = { workouts, user, updateUserProfile }; });
  const prsRef = useRef<Promise<PersonalRecord[]> | null>(null);

  const loadContext = useCallback(async (): Promise<TrainingContext> => {
    const { workouts: log, user: athlete } = latest.current;
    if (!athlete) return { workouts: log, prs: [], bodyweight: DEFAULT_BW };
    // A failed read is retried on the next question — never cached as "no records".
    prsRef.current ??= fetchPersonalRecords(athlete.id).catch((err: unknown) => {
      prsRef.current = null;
      throw err;
    });
    return { workouts: log, prs: await prsRef.current, bodyweight: athlete.weight ?? DEFAULT_BW };
  }, []);

  return useCallback<AskFn>(
    async (message, recent, situation) => {
      const athlete = latest.current.user;
      const reply = await askWodi({
        message, recent, loadContext, situation,
        notes: athlete?.wodiNotes ?? [],
        // The profile's own number — never DEFAULT_BW: a stand-in would be advised on as theirs.
        body: { bodyweightKg: athlete?.weight ?? null, weightUnit: athlete?.weightUnit ?? 'kg' },
      });
      // They told Wodi their body weight: it goes on their profile, the one place every screen reads.
      if (reply.kind !== 'answer' || reply.bodyweightKg == null) return reply;
      try {
        await latest.current.updateUserProfile({ weight: reply.bodyweightKg });
        return reply;
      } catch (err) {
        console.error('[AskWodi] could not save the body weight', err);
        // Wodi has already said it's saved — the athlete hears that it wasn't.
        return { ...reply, text: `${reply.text}\n\nActually — that didn't save. You can set it under Me.` };
      }
    },
    [loadContext],
  );
}
