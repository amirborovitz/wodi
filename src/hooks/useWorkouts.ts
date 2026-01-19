import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import type { Workout, WorkoutType } from '../types';

export interface WorkoutWithStats extends Workout {
  totalReps: number;
  totalVolume: number;
}

interface UseWorkoutsResult {
  workouts: WorkoutWithStats[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  stats: {
    thisWeek: number;
    thisMonth: number;
    totalVolume: number;
  };
}

function getStartOfWeek(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function calculateWorkoutStats(workout: Workout): { totalReps: number; totalVolume: number } {
  let totalReps = 0;
  let totalVolume = 0;

  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      if (set.completed) {
        const reps = set.actualReps || set.targetReps || 0;
        const weight = set.weight || 0;
        totalReps += reps;
        totalVolume += reps * weight;
      }
    }
  }

  return { totalReps, totalVolume };
}

export function useWorkouts(maxCount = 50): UseWorkoutsResult {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<WorkoutWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWorkouts = async () => {
    if (!user) {
      setWorkouts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const workoutsRef = collection(db, 'workouts');
      // Simple query - just filter by userId, then filter/sort in JS
      // This avoids needing a composite Firestore index
      const q = query(
        workoutsRef,
        where('userId', '==', user.id)
      );

      console.log('Fetching workouts for user:', user.id);
      const snapshot = await getDocs(q);
      console.log('Found documents:', snapshot.size);

      const fetchedWorkouts: WorkoutWithStats[] = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          console.log('Workout doc:', doc.id, data);

          const workout: Workout = {
            id: doc.id,
            userId: data.userId,
            date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
            title: data.title,
            type: data.type as WorkoutType,
            imageUrl: data.imageUrl,
            status: data.status,
            exercises: data.exercises || [],
            scores: data.scores,
            duration: data.duration,
            notes: data.notes,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(data.updatedAt),
          };

          const stats = calculateWorkoutStats(workout);
          return { ...workout, ...stats };
        })
        // Filter completed workouts and sort by date (newest first)
        .filter((w) => w.status === 'completed')
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, maxCount);

      console.log('Processed workouts:', fetchedWorkouts.length);
      setWorkouts(fetchedWorkouts);
    } catch (err) {
      console.error('Error fetching workouts:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch workouts'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkouts();
  }, [user?.id]);

  // Calculate summary stats
  const startOfWeek = getStartOfWeek();
  const startOfMonth = getStartOfMonth();

  const stats = {
    thisWeek: workouts.filter((w) => w.date >= startOfWeek).length,
    thisMonth: workouts.filter((w) => w.date >= startOfMonth).length,
    totalVolume: workouts.reduce((acc, w) => acc + w.totalVolume, 0),
  };

  return {
    workouts,
    loading,
    error,
    refresh: fetchWorkouts,
    stats,
  };
}
