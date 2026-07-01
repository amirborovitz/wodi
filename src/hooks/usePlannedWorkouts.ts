import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import type { PlannedWorkout } from '../types';

interface UsePlannedWorkoutsResult {
  planned: PlannedWorkout[];
  loading: boolean;
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

  return { planned, loading };
}
