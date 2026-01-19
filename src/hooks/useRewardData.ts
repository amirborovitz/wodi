import { useState, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { calculateAllRings, getWeekStart } from '../services/rewardCalculations';
import { detectBestAchievement } from '../services/achievementDetection';
import type { RewardData, Exercise, PersonalRecord, Workout, WorkoutType, WorkoutFormat, MuscleGroup, BodyRegion } from '../types';

interface WorkoutSummaryInput {
  title: string;
  type: WorkoutType;
  format?: WorkoutFormat;
  exercises: Exercise[];
  durationMinutes: number;
  totalVolume: number;
  totalReps: number;
  muscleGroups?: {
    muscles: MuscleGroup[];
    byRegion: Record<BodyRegion, MuscleGroup[]>;
    summary: string;
  };
}

interface UseRewardDataResult {
  loading: boolean;
  error: string | null;
  rewardData: RewardData | null;
  calculateRewardData: (
    userId: string,
    workout: WorkoutSummaryInput,
    currentStreak: number,
    totalWorkouts: number
  ) => Promise<RewardData>;
}

export function useRewardData(): UseRewardDataResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewardData, setRewardData] = useState<RewardData | null>(null);

  const calculateRewardData = useCallback(async (
    userId: string,
    workout: WorkoutSummaryInput,
    currentStreak: number,
    totalWorkouts: number
  ): Promise<RewardData> => {
    setLoading(true);
    setError(null);

    try {
      // Fetch weekly workout count
      const weekStart = getWeekStart();
      const workoutsQuery = query(
        collection(db, 'workouts'),
        where('userId', '==', userId),
        where('date', '>=', weekStart),
        where('status', '==', 'completed')
      );

      let workoutsThisWeek = 1; // Start at 1 since we just saved a workout
      try {
        const workoutsSnapshot = await getDocs(workoutsQuery);
        workoutsThisWeek = workoutsSnapshot.size;
      } catch (err) {
        console.warn('Could not fetch weekly workouts, using default:', err);
      }

      // Fetch user's PR history
      let allTimeRecords: PersonalRecord[] = [];
      try {
        const prsQuery = query(
          collection(db, 'personalRecords'),
          where('userId', '==', userId)
        );
        const prsSnapshot = await getDocs(prsQuery);
        allTimeRecords = prsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PersonalRecord[];
      } catch (err) {
        console.warn('Could not fetch PRs, using empty:', err);
      }

      // Fetch recent workouts for benchmark comparison
      let recentWorkouts: Workout[] = [];
      try {
        const recentQuery = query(
          collection(db, 'workouts'),
          where('userId', '==', userId),
          orderBy('date', 'desc'),
          limit(50)
        );
        const recentSnapshot = await getDocs(recentQuery);
        recentWorkouts = recentSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date?.toDate?.() || new Date(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
        })) as Workout[];
      } catch (err) {
        console.warn('Could not fetch recent workouts, using empty:', err);
      }

      // Calculate ring metrics
      const rings = calculateAllRings({
        durationMinutes: workout.durationMinutes,
        workoutType: workout.type,
        exerciseCount: workout.exercises.length,
        totalVolume: workout.totalVolume,
        totalReps: workout.totalReps,
        workoutsThisWeek,
        weeklyGoal: 4, // Default goal
      });

      // Detect best achievement
      const heroAchievement = await detectBestAchievement({
        workout: {
          title: workout.title,
          duration: workout.durationMinutes,
          exercises: workout.exercises,
        },
        allTimeRecords,
        recentWorkouts,
        currentStreak,
        totalWorkouts,
      });

      const data: RewardData = {
        rings,
        heroAchievement,
        workoutSummary: {
          title: workout.title,
          type: workout.type,
          format: workout.format,
          duration: workout.durationMinutes,
          exerciseCount: workout.exercises.length,
          totalVolume: workout.totalVolume,
          totalReps: workout.totalReps,
        },
        exercises: workout.exercises,
        muscleGroups: workout.muscleGroups,
      };

      setRewardData(data);
      setLoading(false);
      return data;
    } catch (err) {
      console.error('Error calculating reward data:', err);
      setError('Failed to calculate reward data');
      setLoading(false);

      // Return fallback data
      const fallbackData: RewardData = {
        rings: calculateAllRings({
          durationMinutes: workout.durationMinutes,
          workoutType: workout.type,
          exerciseCount: workout.exercises.length,
          totalVolume: workout.totalVolume,
          totalReps: workout.totalReps,
          workoutsThisWeek: 1,
          weeklyGoal: 4,
        }),
        heroAchievement: {
          type: 'generic',
          title: 'Workout Complete!',
          subtitle: 'Great job getting it done',
          icon: 'star',
        },
        workoutSummary: {
          title: workout.title,
          type: workout.type,
          format: workout.format,
          duration: workout.durationMinutes,
          exerciseCount: workout.exercises.length,
          totalVolume: workout.totalVolume,
          totalReps: workout.totalReps,
        },
        exercises: workout.exercises,
      };

      setRewardData(fallbackData);
      return fallbackData;
    }
  }, []);

  return {
    loading,
    error,
    rewardData,
    calculateRewardData,
  };
}
