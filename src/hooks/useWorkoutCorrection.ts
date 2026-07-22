import { useCallback, useState } from 'react';
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

/**
 * Appends an athlete-flagged AI mistake ("AI got it wrong?" on the poster) to the
 * workout doc's `corrections` array. Structural corrections downgrade the poster to
 * whiteboard-verbatim rendering (see useCelebrationData); `sessionCorrections` carries
 * the entries submitted this session so the poster reacts without a refetch.
 */
export function useWorkoutCorrection(workoutId: string | undefined): {
  submitCorrection: (reason: string, note: string) => void;
  sessionCorrections: string[];
} {
  const [sessionCorrections, setSessionCorrections] = useState<string[]>([]);

  const submitCorrection = useCallback((reason: string, note: string): void => {
    if (!workoutId) return;
    const entry = note.trim() ? `${reason}: ${note.trim()}` : reason;
    setSessionCorrections((prev) => [...prev, entry]);
    void updateDoc(doc(db, 'workouts', workoutId), { corrections: arrayUnion(entry) }).catch((err) => {
      console.error('Failed to save workout correction:', err);
    });
  }, [workoutId]);

  return { submitCorrection, sessionCorrections };
}
