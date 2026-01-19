import { useMemo } from 'react';
import { useWorkouts } from './useWorkouts';
import type { WorkoutWithStats } from './useWorkouts';
import { useAuth } from '../context/AuthContext';
import { calculateMetconMinutes, calculateWorkoutXP } from '../utils/xpCalculations';
import { DEFAULT_USER_GOALS } from '../types';
import type { UserGoals, XPBreakdown } from '../types';

interface WeeklyStatsResult {
  // Raw values
  weeklyVolume: number;
  weeklyMetconMinutes: number;
  weeklyFrequency: number;
  weeklyXP: number;

  // Percentages (capped at 100 for display, but raw can exceed)
  volumePercent: number;
  metconPercent: number;
  frequencyPercent: number;

  // Goals
  goals: UserGoals;

  // Is overloaded (exceeded goal)?
  volumeOverload: boolean;
  metconOverload: boolean;
  frequencyOverload: boolean;

  // Workouts this week with XP
  weeklyWorkouts: Array<WorkoutWithStats & { xp: XPBreakdown; metconMinutes: number }>;

  // Loading state
  loading: boolean;
}

function getStartOfWeek(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function useWeeklyStats(): WeeklyStatsResult {
  const { user } = useAuth();
  const { workouts, loading } = useWorkouts();

  // Get user goals or defaults
  const goals: UserGoals = user?.goals || DEFAULT_USER_GOALS;

  // Calculate weekly stats
  const weeklyData = useMemo(() => {
    const startOfWeek = getStartOfWeek();

    // Filter to this week's workouts
    const thisWeekWorkouts = workouts.filter((w) => w.date >= startOfWeek);

    // Calculate stats for each workout
    const workoutsWithStats = thisWeekWorkouts.map((workout) => {
      const metconMinutes = calculateMetconMinutes(workout);
      const xp = calculateWorkoutXP(workout.totalVolume, metconMinutes);
      return {
        ...workout,
        metconMinutes,
        xp,
      };
    });

    // Sum up weekly totals
    const weeklyVolume = workoutsWithStats.reduce((acc, w) => acc + w.totalVolume, 0);
    const weeklyMetconMinutes = workoutsWithStats.reduce((acc, w) => acc + w.metconMinutes, 0);
    const weeklyFrequency = workoutsWithStats.length;
    const weeklyXP = workoutsWithStats.reduce((acc, w) => acc + w.xp.total, 0);

    // Calculate percentages
    const volumePercent = Math.round((weeklyVolume / goals.volumeGoal) * 100);
    const metconPercent = Math.round((weeklyMetconMinutes / goals.metconGoal) * 100);
    const frequencyPercent = Math.round((weeklyFrequency / goals.streakGoal) * 100);

    return {
      weeklyVolume,
      weeklyMetconMinutes,
      weeklyFrequency,
      weeklyXP,
      volumePercent,
      metconPercent,
      frequencyPercent,
      volumeOverload: volumePercent > 100,
      metconOverload: metconPercent > 100,
      frequencyOverload: frequencyPercent > 100,
      weeklyWorkouts: workoutsWithStats,
    };
  }, [workouts, goals]);

  return {
    ...weeklyData,
    goals,
    loading,
  };
}

/**
 * Get ISO week number for a date
 */
export function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
}

/**
 * Calculate streak based on consecutive weeks hitting weekly goal
 */
export function calculateWeeklyStreak(
  workouts: Array<{ date: Date }>,
  weeklyGoal: number = 3
): { currentStreak: number; longestStreak: number } {
  if (workouts.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Group workouts by ISO week
  const byWeek: Record<string, number> = {};
  for (const workout of workouts) {
    const week = getISOWeek(workout.date);
    byWeek[week] = (byWeek[week] || 0) + 1;
  }

  // Get sorted weeks
  const weeks = Object.keys(byWeek).sort().reverse();
  if (weeks.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Calculate current streak (from current/last week backwards)
  const currentWeek = getISOWeek(new Date());
  let currentStreak = 0;
  let checkWeek = currentWeek;

  // Check if current week is in progress (might not have hit goal yet)
  // If current week hasn't hit goal, start from previous week
  if (!byWeek[checkWeek] || byWeek[checkWeek] < weeklyGoal) {
    // Go back one week
    const d = new Date();
    d.setDate(d.getDate() - 7);
    checkWeek = getISOWeek(d);
  }

  // Count backwards
  while (byWeek[checkWeek] && byWeek[checkWeek] >= weeklyGoal) {
    currentStreak++;
    const d = new Date();
    d.setDate(d.getDate() - (7 * currentStreak));
    checkWeek = getISOWeek(d);
  }

  // Calculate longest streak
  let longestStreak = 0;
  let tempStreak = 0;

  for (let i = 0; i < weeks.length; i++) {
    if (byWeek[weeks[i]] >= weeklyGoal) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  return { currentStreak, longestStreak };
}
