import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';

interface UsePRCountResult {
  prCount: number;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function usePRCount(): UsePRCountResult {
  const { user } = useAuth();
  const [prCount, setPRCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPRCount = async () => {
    if (!user) {
      setPRCount(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const prsRef = collection(db, 'personalRecords');
      const q = query(prsRef, where('userId', '==', user.id));
      const snapshot = await getDocs(q);

      setPRCount(snapshot.size);
    } catch (err) {
      console.error('Error fetching PR count:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch PR count'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPRCount();
  }, [user?.id]);

  return {
    prCount,
    loading,
    error,
    refresh: fetchPRCount,
  };
}
