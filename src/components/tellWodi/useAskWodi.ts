import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchPersonalRecords } from '../../hooks/usePRs';
import { askWodi, type AskWodiReply } from '../../services/wodiAgent/askWodi';
import type { ChatTurn } from '../../services/tellWodiReader';
import type { TrainingContext } from '../../services/wodiAgent/trainingFacts';
import { DEFAULT_BW } from '../../utils/xpCalculations';
import type { PersonalRecord, Workout } from '../../types';

export type AskFn = (message: string, recent: ChatTurn[]) => Promise<AskWodiReply>;

/**
 * Ask Wodi, wired to this athlete's log: the workouts already loaded for the screen, and their
 * records — read from Firestore only the first time a question needs the log, since most first
 * messages are workouts and never touch it.
 */
export function useAskWodi(workouts: readonly Workout[]): AskFn {
  const { user } = useAuth();
  const latest = useRef({ workouts, user });
  useEffect(() => { latest.current = { workouts, user }; });
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
    (message, recent) => askWodi({ message, recent, loadContext, notes: latest.current.user?.wodiNotes ?? [] }),
    [loadContext],
  );
}
