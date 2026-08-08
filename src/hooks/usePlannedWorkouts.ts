import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import type { PlannedWorkout } from '../types';

interface UsePlannedWorkoutsResult {
  planned: PlannedWorkout[];
  loading: boolean;
  /** Resolves false when the write is rejected, so the caller can keep its confirm sheet up. */
  deleteSavedWod: (savedWodId: string) => Promise<boolean>;
}

export function usePlannedWorkouts(): UsePlannedWorkoutsResult {
  const { user } = useAuth();
  const [planned, setPlanned] = useState<PlannedWorkout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setPlanned([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'savedWods'),
      where('userId', '==', user.id),
    );

    const unsub = onSnapshot(q, (snap) => {
      const items: PlannedWorkout[] = snap.docs
        .map((d) => {
          const data = d.data();
          const createdAt = data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : data.createdAt
              ? new Date(data.createdAt)
              : new Date();

          const status: PlannedWorkout['status'] = data.status === 'scanning' ? 'scanning' : 'parsed';

          return {
            id: d.id,
            userId: data.userId,
            status,
            raw: data.raw ?? data.parsedWorkout?.rawText ?? '',
            parsedWorkout: data.parsedWorkout,
            createdAt,
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setPlanned(items);
      setLoading(false);
    }, (err) => {
      console.error('[usePlannedWorkouts] Firestore error:', err);
      setLoading(false);
    });

    return unsub;
  }, [user?.id]);

  // No local state to prune: the onSnapshot listener above drops the row the moment the
  // delete lands, so reporting success/failure is this function's whole job.
  const deleteSavedWod = useCallback(async (savedWodId: string): Promise<boolean> => {
    try {
      await deleteDoc(doc(db, 'savedWods', savedWodId));
      return true;
    } catch (err) {
      console.error('[usePlannedWorkouts] Failed to delete saved WOD:', err);
      return false;
    }
  }, []);

  return { planned, loading, deleteSavedWod };
}
