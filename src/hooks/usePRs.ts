import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import type { PersonalRecord } from '../types';

interface UsePRsResult {
  prs: PersonalRecord[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/** Every PR event an athlete has, newest first — the one read of the `personalRecords` collection. */
export async function fetchPersonalRecords(userId: string): Promise<PersonalRecord[]> {
  const q = query(
    collection(db, 'personalRecords'),
    where('userId', '==', userId),
    orderBy('date', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      movement: data.movement,
      weight: data.weight,
      date: data.date?.toDate() || new Date(),
      workoutId: data.workoutId,
    };
  });
}

export function usePRs(): UsePRsResult {
  const { user } = useAuth();
  const [prs, setPRs] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPRs = useCallback(async () => {
    if (!user) {
      setPRs([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      setPRs(await fetchPersonalRecords(user.id));
    } catch (err) {
      console.error('Error fetching PRs:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch PRs'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchPRs();
  }, [fetchPRs]);

  return {
    prs,
    loading,
    error,
    refresh: fetchPRs,
  };
}
