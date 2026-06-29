import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
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
      collection(db, 'plannedWorkouts'),
      where('userId', '==', user.id),
      orderBy('plannedDate', 'asc'),
    );

    const unsub = onSnapshot(q, (snap) => {
      const items: PlannedWorkout[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          parsedWorkout: data.parsedWorkout,
          plannedDate: data.plannedDate instanceof Timestamp
            ? data.plannedDate.toDate()
            : new Date(data.plannedDate),
          createdAt: data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date(data.createdAt),
        };
      });
      setPlanned(items);
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return unsub;
  }, [user?.id]);

  return { planned, loading };
}
