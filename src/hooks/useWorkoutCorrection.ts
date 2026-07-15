import { useCallback } from 'react';
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

/**
 * Appends an athlete-flagged AI mistake ("AI got it wrong?" on the poster) to the
 * workout doc's `corrections` array. Corrections are stored for a future fix pass —
 * they don't re-parse the workout in place.
 */
export function useWorkoutCorrection(workoutId: string | undefined): {
  submitCorrection: (reason: string, note: string) => void;
} {
  const submitCorrection = useCallback((reason: string, note: string): void => {
    if (!workoutId) return;
    const entry = note.trim() ? `${reason}: ${note.trim()}` : reason;
    void updateDoc(doc(db, 'workouts', workoutId), { corrections: arrayUnion(entry) }).catch((err) => {
      console.error('Failed to save workout correction:', err);
    });
  }, [workoutId]);

  return { submitCorrection };
}
