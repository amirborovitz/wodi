import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { dropRecordsForWorkout, reconcileRecordsForWorkout } from '../services/personalRecordSync';
import { useAuth } from '../context/AuthContext';
import {
  POSTER_CUSTOMIZATION_EVENT,
  type PosterCustomizationEventDetail,
} from './usePosterCustomization';
// THE one ordering for the workout list — every consumer (gallery, home rail,
// recaps) reads this order. Don't re-sort downstream.
import { byNewestTrained } from '../utils/workoutDate';
import type { Achievement, PosterSkinId, PosterSticker, PosterVibeKey, PosterVibeOffset, Workout, WorkoutType } from '../types';

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
  /** Flag/unflag a saved workout as a throwaway test. Resolves false if the write failed. */
  setWorkoutTest: (workoutId: string, isTest: boolean) => Promise<boolean>;
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

interface UseWorkoutsOptions {
  /**
   * Include throwaway test workouts. Default false: every count, total, recap and record reads
   * through this hook, so ONE filter here keeps them all clean rather than asking each consumer
   * to remember. Only a surface whose job is managing the workouts themselves (the Gallery, so
   * they can be found and deleted) should opt in.
   */
  includeTests?: boolean;
}

export function useWorkouts(maxCount = 50, options: UseWorkoutsOptions = {}): UseWorkoutsResult {
  const { includeTests = false } = options;
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
      const prAchievementsByWorkoutId = new Map<string, Achievement[]>();
      prSnapshot.docs.forEach((prDoc) => {
        const pr = prDoc.data();
        const workoutId = pr.workoutId as string | undefined;
        const movement = pr.movement as string | undefined;
        const weight = pr.weight as number | undefined;
        if (!workoutId || !movement || !weight) return;
        const achievement: Achievement = {
          type: 'pr',
          title: 'New PR!',
          subtitle: `${weight}kg ${movement}`,
          movement,
          value: weight,
          icon: 'trophy',
        };
        const existing = prAchievementsByWorkoutId.get(workoutId) || [];
        existing.push(achievement);
        prAchievementsByWorkoutId.set(workoutId, existing);
      });
      console.log('Found documents:', snapshot.size);

      const fetchedWorkouts: WorkoutWithStats[] = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          console.log('Workout doc:', doc.id, data);
          const prAchievements = prAchievementsByWorkoutId.get(doc.id) || [];
          const achievements = (data.achievements as Achievement[] | undefined) || prAchievements;
          const heroAchievement = (data.heroAchievement as Achievement | undefined) || achievements[0];
          const isPR = Boolean(data.isPR || data.hasPR || data.pr || prWorkoutIds.has(doc.id) || achievements.some(a => a.type === 'pr'));

          const workout: Workout = {
            id: doc.id,
            userId: data.userId,
            date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
            sourceDate: typeof data.sourceDate === 'string' ? data.sourceDate : undefined,
            title: data.title,
            type: data.type as WorkoutType,
            stationRotation: data.stationRotation === true ? true : undefined,
            imageUrl: data.imageUrl,
            partnerWorkout: data.partnerWorkout,
            partnerFactor: data.partnerFactor,
            teamSize: data.teamSize,
            partnerNames: Array.isArray(data.partnerNames) ? (data.partnerNames as string[]) : undefined,
            workloadBreakdown: data.workloadBreakdown,
            status: data.status,
            exercises: data.exercises || [],
            scores: data.scores,
            duration: data.duration,
            durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : undefined,
            notes: data.notes,
            rawText: data.rawText || undefined,
            userContext: typeof data.userContext === 'string' ? data.userContext : undefined,
            corrections: Array.isArray(data.corrections) ? (data.corrections as string[]) : undefined,
            timeCap: data.timeCap,
            format: data.format,
            // Container fields — the edit path rebuilds the original parse from these; nothing
            // renders them. See workoutToParsedWorkout.
            containerRounds: typeof data.containerRounds === 'number' ? data.containerRounds : undefined,
            sets: typeof data.sets === 'number' ? data.sets : undefined,
            intervalTime: typeof data.intervalTime === 'number' ? data.intervalTime : undefined,
            feelRating: data.feelRating,
            difficultyLevel: typeof data.difficultyLevel === 'number' ? data.difficultyLevel : undefined,
            posterSkin: data.posterSkin as PosterSkinId | undefined,
            posterVibe: data.posterVibe as PosterVibeKey | undefined,
            posterSticker: data.posterSticker as PosterSticker | undefined,
            posterVibeOffset: data.posterVibeOffset as PosterVibeOffset | undefined,
            heroAchievement,
            achievements,
            isPR,
            isTest: data.isTest === true,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(data.updatedAt),
          };

          const stats = calculateWorkoutStats(workout);
          return { ...workout, ...stats, isPR };
        })
        // Keep the most recently TRAINED workouts — the cap has to be applied after
        // the real-date sort, or a late-logged old board would displace a newer one.
        .filter((w) => w.status === 'completed')
        .filter((w) => includeTests || !w.isTest)
        .sort(byNewestTrained)
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePosterCustomization = (event: Event): void => {
      const customEvent = event as CustomEvent<PosterCustomizationEventDetail>;
      const { workoutId, update } = customEvent.detail;

      setWorkouts((prev) => {
        const next = prev.map((workout) => {
          if (workout.id !== workoutId) return workout;
          return {
            ...workout,
            ...(update.posterSkin !== undefined ? { posterSkin: update.posterSkin } : {}),
            ...(update.posterVibe !== undefined ? { posterVibe: update.posterVibe ?? undefined } : {}),
            ...(update.sourceDate !== undefined ? { sourceDate: update.sourceDate } : {}),
            ...(update.posterSticker !== undefined ? { posterSticker: update.posterSticker ?? undefined } : {}),
            ...(update.posterVibeOffset !== undefined ? { posterVibeOffset: update.posterVibeOffset ?? undefined } : {}),
          };
        });
        // Correcting the date on the poster now moves the workout in the gallery, so
        // the list has to re-order here — skin/vibe/sticker edits never affect order.
        return update.sourceDate !== undefined ? next.sort(byNewestTrained) : next;
      });
    };

    window.addEventListener(POSTER_CUSTOMIZATION_EVENT, handlePosterCustomization);
    return () => window.removeEventListener(POSTER_CUSTOMIZATION_EVENT, handlePosterCustomization);
  }, []);

  const deleteWorkout = async (workoutId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      await deleteDoc(doc(db, 'workouts', workoutId));
      // The records this session set have to go with it, or the Records screen keeps showing a
      // best that no longer has a workout behind it. Deliberately not awaited into the result:
      // the workout IS gone, and reporting the delete as failed over a leftover record row would
      // send the athlete back to re-delete something that no longer exists.
      void dropRecordsForWorkout(user.id, workoutId);
      // Remove from local state immediately for instant feedback
      setWorkouts(prev => prev.filter(w => w.id !== workoutId));
      return true;
    } catch (err) {
      console.error('Error deleting workout:', err);
      return false;
    }
  };

  const setWorkoutTest = async (workoutId: string, isTest: boolean): Promise<boolean> => {
    if (!user) return false;
    const target = workouts.find((w) => w.id === workoutId);

    try {
      await updateDoc(doc(db, 'workouts', workoutId), { isTest });

      // Records are the second thing the read filter can't reach. The save-time guard only ever
      // stopped a TEST workout from writing PRs; a real workout flagged afterwards kept every
      // record it had set, which is the case the guard exists to prevent. Symmetric on unflag, or
      // the flag would be a one-way trip for the athlete's records.
      if (isTest) {
        void dropRecordsForWorkout(user.id, workoutId);
      } else if (target) {
        void reconcileRecordsForWorkout(user.id, {
          id: workoutId, title: target.title, exercises: target.exercises, date: target.date,
        });
      }

      // The save already bumped the user-doc counters for this workout, and those are the one
      // thing the read filter can't reach — so flagging has to walk them back, and unflagging has
      // to put them back. Without this the totals drift by a workout every time the flag is used.
      if (target) {
        const sign = isTest ? -1 : 1;
        await setDoc(doc(db, 'users', user.id), {
          stats: {
            totalWorkouts: increment(sign),
            totalVolume: increment(sign * (target.totalVolume || 0)),
          },
        }, { merge: true });
      }

      // Honour this consumer's own filter, or the change leaves no trace: on Home (which excludes
      // tests) the poster used to sit in the rail exactly as before, so nothing told the athlete
      // the flag had taken. Dropping it there IS the feedback; the Gallery opted in, so it keeps
      // the row and re-renders it badged.
      setWorkouts((prev) => (
        !includeTests && isTest
          ? prev.filter((w) => w.id !== workoutId)
          : prev.map((w) => (w.id === workoutId ? { ...w, isTest } : w))
      ));
      return true;
    } catch (err) {
      console.error('Error updating test flag:', err);
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
    setWorkoutTest,
    stats,
  };
}
