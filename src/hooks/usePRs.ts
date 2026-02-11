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

      const prsRef = collection(db, 'personalRecords');
      const q = query(
        prsRef,
        where('userId', '==', user.id),
        orderBy('date', 'desc')
      );
      const snapshot = await getDocs(q);

      const prData: PersonalRecord[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          movement: data.movement,
          weight: data.weight,
          date: data.date?.toDate() || new Date(),
          workoutId: data.workoutId,
        };
      });

      setPRs(prData);
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
