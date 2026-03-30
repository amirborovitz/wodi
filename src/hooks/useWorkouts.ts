import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import type { Workout, WorkoutType } from '../types';

export interface WorkoutWithStats extends Workout {
  totalReps: number;
  totalVolume: number;
  isPR?: boolean;
}

interface UseWorkoutsResult {
  workouts: WorkoutWithStats[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  deleteWorkout: (workoutId: string) => Promise<boolean>;
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
  if (workout.workloadBreakdown) {
    return {
      totalReps: workout.workloadBreakdown.grandTotalReps || 0,
      totalVolume: workout.workloadBreakdown.grandTotalVolume || 0,
    };
  }
  let totalReps = 0;
  let totalVolume = 0;

  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      const reps = set.actualReps ?? (set.completed ? set.targetReps : 0) ?? 0;
      if (reps > 0) {
        const weight = set.weight || 0;
        totalReps += reps;
        totalVolume += reps * weight;
      }
    }
  }

  const partnerFactor = workout.partnerFactor ?? (workout.partnerWorkout ? 0.5 : 1);
  if (partnerFactor !== 1) {
    return {
      totalReps: Math.round(totalReps * partnerFactor),
      totalVolume: Math.round(totalVolume * partnerFactor),
    };
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
      const prsRef = collection(db, 'personalRecords');
      const prQuery = query(
        prsRef,
        where('userId', '==', user.id)
      );

      const [snapshot, prSnapshot] = await Promise.all([getDocs(q), getDocs(prQuery)]);
      const prWorkoutIds = new Set(
        prSnapshot.docs
          .map((doc) => doc.data().workoutId as string | undefined)
          .filter((id): id is string => Boolean(id))
      );
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
            partnerWorkout: data.partnerWorkout,
            partnerFactor: data.partnerFactor,
            teamSize: data.teamSize,
            workloadBreakdown: data.workloadBreakdown,
            status: data.status,
            exercises: data.exercises || [],
            scores: data.scores,
            duration: data.duration,
            notes: data.notes,
            rawText: data.rawText || undefined,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(data.updatedAt),
          };

          const stats = calculateWorkoutStats(workout);
          const isPR = Boolean(data.isPR || data.hasPR || data.pr || prWorkoutIds.has(doc.id));
          return { ...workout, ...stats, isPR };
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

  const deleteWorkout = async (workoutId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      await deleteDoc(doc(db, 'workouts', workoutId));
      // Remove from local state immediately for instant feedback
      setWorkouts(prev => prev.filter(w => w.id !== workoutId));
      return true;
    } catch (err) {
      console.error('Error deleting workout:', err);
      return false;
    }
  };

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
    deleteWorkout,
    stats,
  };
}
