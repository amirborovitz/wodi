import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useWorkouts, type WorkoutWithStats } from '../hooks/useWorkouts';
import { shareWorkoutCard } from '../utils/shareUtils';
import styles from './HomeScreen.module.css';

interface HomeScreenProps {
  onAddWorkout: () => void;
  onImageSelected?: (file: File) => void;
  onUsePastWorkout?: () => void;
  onOpenProfile?: () => void;
  onSelectWorkout?: (workout: WorkoutWithStats, sortedList: WorkoutWithStats[]) => void;
  ringsKey?: number;
}

type CollectionCardType = 'capture' | 'movement' | 'period' | 'milestone' | 'recent' | 'streak' | 'locked' | 'onboarding';

interface CollectionCard {
  id: string;
  type: CollectionCardType;
  size: 'full' | 'half';
  eyebrow: string;
  title: string;
  hero: string;
  heroUnit?: string;
  subtitle: string;
  note?: string;
  chip?: string;
  accent: string;
  accentSoft: string;
  accentAlt: string;
  pattern: string;
  significance: number;
  changedAt: number;
  workouts: WorkoutWithStats[];
  locked?: boolean;
  isNew?: boolean;
  shareTitle: string;
  chipTone?: 'yellow' | 'magenta' | 'cyan';
}

type CardVisualTone = 'poster' | 'movement' | 'period' | 'milestone' | 'streak' | 'locked' | 'onboarding';

interface MovementAggregate {
  key: string;
  label: string;
  reps: number;
  distanceMeters: number;
  loadedKg: number;
  calories: number;
  timeSeconds: number;
  workouts: WorkoutWithStats[];
  lastChanged: number;
  recentDelta: number;
}

interface PeriodSummary {
  workouts: WorkoutWithStats[];
  workoutCount: number;
  totalVolumeKg: number;
  totalHours: number;
  changedAt: number;
}

const MOVEMENT_REP_THRESHOLDS = [1000, 5000, 10000];
const WORKOUT_THRESHOLDS = [1, 10, 50, 100];
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_PX = 10;
const PULL_REFRESH_TRIGGER = 82;
const ADMIN_EMAIL = 'aborovitz@gmail.com';

const PALETTES = [
  { accent: '#FFD600', accentSoft: 'rgba(255, 214, 0, 0.22)', accentAlt: '#FF8A00', pattern: 'sunburst' },
  { accent: '#FF00E5', accentSoft: 'rgba(255, 0, 229, 0.22)', accentAlt: '#FFD600', pattern: 'halftone' },
  { accent: '#00FFFF', accentSoft: 'rgba(0, 255, 255, 0.20)', accentAlt: '#7CFF5B', pattern: 'grid' },
  { accent: '#FF6B6B', accentSoft: 'rgba(255, 107, 107, 0.22)', accentAlt: '#FFD600', pattern: 'diagonal' },
  { accent: '#7CFF5B', accentSoft: 'rgba(124, 255, 91, 0.20)', accentAlt: '#00FFFF', pattern: 'mesh' },
  { accent: '#A78BFA', accentSoft: 'rgba(167, 139, 250, 0.22)', accentAlt: '#FF00E5', pattern: 'rings' },
];

function startOfWeek(date: Date): Date {
  const value = new Date(date);
  const day = value.getDay();
  const diff = value.getDate() - day + (day === 0 ? -6 : 1);
  value.setDate(diff);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function pluralize(value: number, singular: string, plural = `${singular}S`): string {
  return value === 1 ? singular : plural;
}

function formatDurationHours(minutes: number): string {
  if (!minutes) return '0 HRS';
  const hours = minutes / 60;
  if (hours >= 10) return `${hours.toFixed(0)} HRS`;
  if (hours >= 1) return `${hours.toFixed(1)} HRS`;
  return `${minutes} MIN`;
}

function formatVolumeHero(kg: number): { hero: string; unit: string } {
  if (kg >= 1000) return { hero: (kg / 1000).toFixed(1), unit: 'TONS' };
  return { hero: `${Math.round(kg)}`, unit: 'KG' };
}

function formatMovementHero(movement: MovementAggregate): { hero: string; unit: string; subtitle: string } {
  const year = new Date().getFullYear();
  if (movement.distanceMeters >= 5000 && movement.distanceMeters >= movement.reps) {
    const km = movement.distanceMeters / 1000;
    return {
      hero: km >= 10 ? km.toFixed(1) : km.toFixed(2),
      unit: 'KM MOVED',
      subtitle: `${movement.label.toUpperCase()} · ${year}`,
    };
  }
  if (movement.loadedKg >= 1000 && movement.reps < 50) {
    return {
      hero: (movement.loadedKg / 1000).toFixed(1),
      unit: 'TONS',
      subtitle: `${movement.label.toUpperCase()} · ${year}`,
    };
  }
  return {
    hero: movement.reps.toLocaleString(),
    unit: movement.reps === 1 ? 'REP' : 'REPS',
    subtitle: `${movement.label.toUpperCase()} · ${year}`,
  };
}

function formatDeltaLabel(movement: MovementAggregate): string | undefined {
  if (movement.recentDelta <= 0) return undefined;
  return `+${movement.recentDelta.toLocaleString()} TODAY`;
}

function titleCaseMovement(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function normalizeMovement(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function paletteFor(key: string) {
  return PALETTES[hashString(key) % PALETTES.length];
}

function safeWeightVolume(weight: number | undefined, reps: number, progression?: number[], implementCount?: number): number {
  const multi = implementCount && implementCount > 1 ? implementCount : 1;
  if (progression && progression.length > 0 && reps > 0) {
    const repsPerSet = Math.max(1, Math.round(reps / progression.length));
    return progression.reduce((total, current) => total + (current * repsPerSet * multi), 0);
  }
  if (!weight || reps <= 0) return 0;
  return weight * reps * multi;
}

function workoutSummaryLine(workout: WorkoutWithStats): string {
  const movements = workout.workloadBreakdown?.movements ?? [];
  if (movements.length > 0) {
    return movements.slice(0, 3).map((movement) => movement.name.toUpperCase()).join(' · ');
  }
  return workout.exercises.slice(0, 3).map((exercise) => exercise.name.toUpperCase()).join(' · ') || workout.title.toUpperCase();
}

function buildMovementAggregates(workouts: WorkoutWithStats[], currentYear: number): MovementAggregate[] {
  const currentYearWorkouts = workouts.filter((workout) => workout.date.getFullYear() === currentYear);
  const latestWorkout = workouts[0];
  const totals = new Map<string, MovementAggregate>();

  for (const workout of currentYearWorkouts) {
    for (const movement of workout.workloadBreakdown?.movements ?? []) {
      const key = normalizeMovement(movement.name);
      if (!key) continue;

      const existing = totals.get(key) ?? {
        key,
        label: titleCaseMovement(movement.originalMovement || movement.name),
        reps: 0,
        distanceMeters: 0,
        loadedKg: 0,
        calories: 0,
        timeSeconds: 0,
        workouts: [],
        lastChanged: 0,
        recentDelta: 0,
      };

      const reps = movement.totalReps || 0;
      const distance = movement.totalDistance || 0;
      const calories = movement.totalCalories || 0;
      const timeSeconds = movement.totalTime || 0;
      const loadedKg = safeWeightVolume(movement.weight, reps, movement.weightProgression, movement.implementCount);

      existing.reps += reps;
      existing.distanceMeters += distance;
      existing.calories += calories;
      existing.timeSeconds += timeSeconds;
      existing.loadedKg += loadedKg;
      existing.lastChanged = Math.max(existing.lastChanged, workout.date.getTime());
      if (!existing.workouts.some((entry) => entry.id === workout.id)) {
        existing.workouts.push(workout);
      }

      if (latestWorkout?.id === workout.id) {
        existing.recentDelta += reps || Math.round(distance) || Math.round(loadedKg);
      }

      totals.set(key, existing);
    }
  }

  return Array.from(totals.values())
    .filter((movement) => movement.reps >= 50 || movement.loadedKg >= 1000 || movement.distanceMeters >= 5000)
    .sort((left, right) => {
      const leftScore = Math.max(left.reps, left.loadedKg / 10, left.distanceMeters / 10);
      const rightScore = Math.max(right.reps, right.loadedKg / 10, right.distanceMeters / 10);
      if (right.lastChanged !== left.lastChanged) return right.lastChanged - left.lastChanged;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return left.label.localeCompare(right.label);
    });
}

function buildPeriodSummary(workouts: WorkoutWithStats[]): PeriodSummary {
  return {
    workouts,
    workoutCount: workouts.length,
    totalVolumeKg: workouts.reduce((total, workout) => total + workout.totalVolume, 0),
    totalHours: workouts.reduce((total, workout) => total + (workout.duration || 0), 0),
    changedAt: workouts[0]?.date.getTime() ?? 0,
  };
}

function buildMilestoneCards(workouts: WorkoutWithStats[], movementTotals: MovementAggregate[]): CollectionCard[] {
  const cards: CollectionCard[] = [];
  const latestWorkout = workouts[0];

  for (const threshold of WORKOUT_THRESHOLDS) {
    if (workouts.length < threshold) continue;
    const palette = paletteFor(`wods-${threshold}`);
    const isNew = workouts.length - 1 < threshold;
    cards.push({
      id: `milestone-workouts-${threshold}`,
      type: 'milestone',
      size: threshold >= 50 ? 'full' : 'half',
      eyebrow: isNew ? 'NEW DROP' : 'MILESTONE',
      title: threshold === 1 ? 'FIRST WORKOUT ON THE WALL' : 'WORKOUT MILESTONE',
      hero: threshold.toLocaleString(),
      heroUnit: pluralize(threshold, 'WOD'),
      subtitle: threshold === 1 ? 'COLLECTION TIER 1' : `COLLECTION TIER ${threshold}`,
      note: isNew ? 'Unlocked on your latest log' : 'Rare card',
      chip: isNew ? 'JUST UNLOCKED' : 'RARE',
      chipTone: 'yellow',
      accent: palette.accent,
      accentSoft: palette.accentSoft,
      accentAlt: palette.accentAlt,
      pattern: 'holo',
      significance: threshold * 10,
      changedAt: latestWorkout?.date.getTime() ?? 0,
      workouts: workouts.slice(0, threshold === 1 ? 1 : Math.min(workouts.length, 24)),
      isNew,
      shareTitle: `${threshold} WOD milestone`,
    });
  }

  for (const movement of movementTotals.slice(0, 8)) {
    for (const threshold of MOVEMENT_REP_THRESHOLDS) {
      if (movement.reps < threshold) continue;
      const palette = paletteFor(`${movement.key}-${threshold}`);
      const isNew = movement.recentDelta > 0 && movement.reps - movement.recentDelta < threshold;
      cards.push({
        id: `milestone-${movement.key}-${threshold}`,
        type: 'milestone',
        size: threshold >= 5000 ? 'full' : 'half',
        eyebrow: isNew ? 'NEW DROP' : 'MILESTONE',
        title: `${movement.label.toUpperCase()} CLUB`,
        hero: threshold.toLocaleString(),
        heroUnit: 'REPS',
        subtitle: `${movement.label.toUpperCase()} UNLOCKED`,
        note: isNew ? `Crossed the line with your latest ${movement.label.toLowerCase()} work` : 'Rare card',
        chip: threshold >= 10000 ? 'LEGENDARY' : 'MILESTONE',
        chipTone: threshold >= 10000 ? 'magenta' : 'yellow',
        accent: palette.accent,
        accentSoft: palette.accentSoft,
        accentAlt: palette.accentAlt,
        pattern: 'foil',
        significance: threshold,
        changedAt: movement.lastChanged,
        workouts: movement.workouts,
        isNew,
        shareTitle: `${threshold} ${movement.label} milestone`,
      });
    }
  }

  return cards
    .sort((left, right) => {
      if (Number(right.isNew) !== Number(left.isNew)) return Number(right.isNew) - Number(left.isNew);
      if (right.changedAt !== left.changedAt) return right.changedAt - left.changedAt;
      return right.significance - left.significance;
    })
    .slice(0, 6);
}

function buildPotentialLockedCards(workouts: WorkoutWithStats[]): CollectionCard[] {
  const latestWorkout = workouts[0];
  const movementNames = latestWorkout?.workloadBreakdown?.movements?.map((movement) => titleCaseMovement(movement.name)) ?? ['Squats', 'Pull-Ups', 'Runs'];

  return movementNames.slice(0, 3).map((movementName, index) => {
    const palette = paletteFor(`locked-${movementName}-${index}`);
    return {
      id: `locked-${movementName}-${index}`,
      type: 'locked',
      size: 'half',
      eyebrow: 'LOCKED CARD',
      title: movementName.toUpperCase(),
      hero: '50',
      heroUnit: 'TO UNLOCK',
      subtitle: `Log ${movementName.toLowerCase()} to start your poster`,
      note: `Next collectible: ${movementName.toUpperCase()} TOTAL`,
      chip: 'COMING SOON',
      chipTone: 'magenta',
      accent: palette.accent,
      accentSoft: palette.accentSoft,
      accentAlt: palette.accentAlt,
      pattern: 'locked',
      significance: 10 - index,
      changedAt: latestWorkout?.date.getTime() ?? 0,
      workouts: [],
      locked: true,
      shareTitle: `${movementName} locked card`,
    };
  });
}

function arrangeCardsForGrid(cards: CollectionCard[]): CollectionCard[] {
  const arranged: CollectionCard[] = [];
  const pendingHalfCards: CollectionCard[] = [];

  for (const card of cards) {
    if (card.size === 'half') {
      pendingHalfCards.push(card);
      if (pendingHalfCards.length === 2) {
        arranged.push(...pendingHalfCards.splice(0, 2));
      }
      continue;
    }

    arranged.push(card);
  }

  arranged.push(...pendingHalfCards);
  return arranged;
}

function buildCollectionCards(workouts: WorkoutWithStats[], streak: number): CollectionCard[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const latestWorkout = workouts[0];
  const movementTotals = buildMovementAggregates(workouts, currentYear);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const weekSummary = buildPeriodSummary(workouts.filter((workout) => workout.date >= weekStart));
  const monthSummary = buildPeriodSummary(workouts.filter((workout) => workout.date >= monthStart));
  const featuredCards: CollectionCard[] = [];
  const movementCards: CollectionCard[] = [];
  const summaryCards: CollectionCard[] = [];
  const milestoneCards: CollectionCard[] = [];
  const starterCards: CollectionCard[] = [];

  const recentPalette = paletteFor('recent');
  if (latestWorkout) {
    featuredCards.push({
      id: `recent-${latestWorkout.id}`,
      type: 'recent',
      size: 'full',
      eyebrow: 'LATEST POSTER',
      title: latestWorkout.title.toUpperCase(),
      hero: formatShortDate(latestWorkout.date).toUpperCase(),
      heroUnit: latestWorkout.duration ? `${latestWorkout.duration} MIN` : undefined,
      subtitle: workoutSummaryLine(latestWorkout),
      note: latestWorkout.isPR ? 'PR INSIDE' : 'Tap for the full poster',
      chip: latestWorkout.isPR ? 'PR' : 'RECENT',
      chipTone: latestWorkout.isPR ? 'yellow' : 'cyan',
      accent: recentPalette.accent,
      accentSoft: recentPalette.accentSoft,
      accentAlt: recentPalette.accentAlt,
      pattern: 'poster',
      significance: 1500,
      changedAt: latestWorkout.date.getTime(),
      workouts: [latestWorkout],
      shareTitle: latestWorkout.title,
    });
  }

  if (streak > 0) {
    const streakPalette = paletteFor(`streak-${streak}`);
    featuredCards.push({
      id: 'streak-card',
      type: 'streak',
      size: 'half',
      eyebrow: 'STREAK',
      title: 'KEEP THE WALL HOT',
      hero: streak.toLocaleString(),
      heroUnit: streak === 1 ? 'DAY' : 'DAYS',
      subtitle: streak === 1 ? 'You started the run' : `${streak}-day streak alive`,
      note: latestWorkout ? `Last log ${formatShortDate(latestWorkout.date)}` : undefined,
      chip: streak >= 7 ? 'ON FIRE' : 'LIVE',
      chipTone: streak >= 7 ? 'magenta' : 'cyan',
      accent: streakPalette.accent,
      accentSoft: streakPalette.accentSoft,
      accentAlt: streakPalette.accentAlt,
      pattern: 'spark',
      significance: 900 + streak,
      changedAt: latestWorkout?.date.getTime() ?? 0,
      workouts: workouts.slice(0, Math.min(workouts.length, 14)),
      shareTitle: `${streak}-day Wodi streak`,
    });
  }

  const weeklyPalette = paletteFor('week');
  summaryCards.push({
    id: 'period-week',
    type: 'period',
    size: 'half',
    eyebrow: 'THIS WEEK',
    title: 'WEEKLY DROP',
    hero: weekSummary.workoutCount.toLocaleString(),
    heroUnit: pluralize(weekSummary.workoutCount, 'WOD'),
    subtitle: `${formatVolumeHero(weekSummary.totalVolumeKg).hero} ${formatVolumeHero(weekSummary.totalVolumeKg).unit} · ${formatDurationHours(weekSummary.totalHours)}`,
    note: 'Resets Monday',
    chip: 'LIVE',
    chipTone: 'cyan',
    accent: weeklyPalette.accent,
    accentSoft: weeklyPalette.accentSoft,
    accentAlt: weeklyPalette.accentAlt,
    pattern: 'grid',
    significance: 800 + weekSummary.workoutCount,
    changedAt: weekSummary.changedAt,
    workouts: weekSummary.workouts,
    shareTitle: 'This week on Wodi',
  });

  const monthlyPalette = paletteFor('month');
  summaryCards.push({
    id: 'period-month',
    type: 'period',
    size: 'half',
    eyebrow: 'THIS MONTH',
    title: 'MONTHLY ARCHIVE',
    hero: monthSummary.workoutCount.toLocaleString(),
    heroUnit: pluralize(monthSummary.workoutCount, 'WOD'),
    subtitle: `${formatVolumeHero(monthSummary.totalVolumeKg).hero} ${formatVolumeHero(monthSummary.totalVolumeKg).unit} · ${formatDurationHours(monthSummary.totalHours)}`,
    note: 'Resets on the 1st',
    chip: 'LIVE',
    chipTone: 'cyan',
    accent: monthlyPalette.accent,
    accentSoft: monthlyPalette.accentSoft,
    accentAlt: monthlyPalette.accentAlt,
    pattern: 'diagonal',
    significance: 700 + monthSummary.workoutCount,
    changedAt: monthSummary.changedAt,
    workouts: monthSummary.workouts,
    shareTitle: 'This month on Wodi',
  });

  movementTotals.slice(0, workouts.length > 100 ? 18 : workouts.length > 10 ? 12 : 6).forEach((movement, index) => {
    const palette = paletteFor(movement.key);
    const hero = formatMovementHero(movement);
    movementCards.push({
      id: `movement-${movement.key}`,
      type: 'movement',
      size: index < 1 || movement.reps >= 2000 ? 'full' : 'half',
      eyebrow: 'TOTALS CARD',
      title: movement.label.toUpperCase(),
      hero: hero.hero,
      heroUnit: hero.unit,
      subtitle: hero.subtitle,
      note: formatDeltaLabel(movement) ?? `${movement.workouts.length} contributing WODs`,
      chip: movement.recentDelta > 0 ? 'UPDATED' : 'COLLECTED',
      chipTone: movement.recentDelta > 0 ? 'magenta' : 'yellow',
      accent: palette.accent,
      accentSoft: palette.accentSoft,
      accentAlt: palette.accentAlt,
      pattern: palette.pattern,
      significance: Math.max(movement.reps, movement.distanceMeters, movement.loadedKg / 10),
      changedAt: movement.lastChanged,
      workouts: movement.workouts,
      shareTitle: `${movement.label} total`,
    });
  });

  milestoneCards.push(...buildMilestoneCards(workouts, movementTotals));

  if (workouts.length <= 3) {
    const onboardingPalette = paletteFor('onboarding');
    starterCards.push({
      id: 'onboarding-backfill',
      type: 'onboarding',
      size: 'full',
      eyebrow: 'STARTER PACK',
      title: 'SEED THE WALL',
      hero: workouts.length.toLocaleString(),
      heroUnit: workouts.length === 1 ? 'POSTER' : 'POSTERS',
      subtitle: 'Backfill a few recent workouts and your collection gets rich fast',
      note: 'A wall with three to five logs already starts to feel curated',
      chip: 'RECOMMENDED',
      chipTone: 'cyan',
      accent: onboardingPalette.accent,
      accentSoft: onboardingPalette.accentSoft,
      accentAlt: onboardingPalette.accentAlt,
      pattern: 'mesh',
      significance: 500,
      changedAt: latestWorkout?.date.getTime() ?? 0,
      workouts: workouts,
      shareTitle: 'Seed the wall',
    });
    starterCards.push(...buildPotentialLockedCards(workouts));
  }

  movementCards.sort((left, right) => {
    if (right.changedAt !== left.changedAt) return right.changedAt - left.changedAt;
    if (right.significance !== left.significance) return right.significance - left.significance;
    return left.title.localeCompare(right.title);
  });

  milestoneCards.sort((left, right) => {
    if (Number(right.isNew) !== Number(left.isNew)) return Number(right.isNew) - Number(left.isNew);
    if (right.changedAt !== left.changedAt) return right.changedAt - left.changedAt;
    return right.significance - left.significance;
  });

  const arranged = [
    ...featuredCards,
    ...arrangeCardsForGrid(movementCards.slice(0, 4)),
    ...arrangeCardsForGrid(summaryCards),
    ...arrangeCardsForGrid(milestoneCards),
    ...arrangeCardsForGrid(movementCards.slice(4)),
    ...arrangeCardsForGrid(starterCards),
  ];

  return arranged;
}

function getCardTone(card: CollectionCard): CardVisualTone {
  if (card.type === 'recent') return 'poster';
  if (card.type === 'period') return 'period';
  if (card.type === 'milestone') return 'milestone';
  if (card.type === 'streak') return 'streak';
  if (card.type === 'locked') return 'locked';
  if (card.type === 'onboarding') return 'onboarding';
  return 'movement';
}

function CardPattern({ pattern }: { pattern: string }) {
  return (
    <>
      {pattern === 'grid' && <div className={styles.patternGrid} aria-hidden="true" />}
      {pattern === 'halftone' && <div className={styles.patternHalftone} aria-hidden="true" />}
      {pattern === 'diagonal' && <div className={styles.patternDiagonal} aria-hidden="true" />}
      {pattern === 'mesh' && <div className={styles.patternMesh} aria-hidden="true" />}
      {pattern === 'spark' && <div className={styles.patternSpark} aria-hidden="true" />}
      {pattern === 'holo' && <div className={styles.patternHolo} aria-hidden="true" />}
      {pattern === 'foil' && <div className={styles.patternFoil} aria-hidden="true" />}
      {pattern === 'locked' && <div className={styles.patternLocked} aria-hidden="true" />}
      {pattern === 'poster' && <div className={styles.patternPoster} aria-hidden="true" />}
      {pattern === 'rings' && <div className={styles.patternRings} aria-hidden="true" />}
      {pattern === 'sunburst' && <div className={styles.patternSunburst} aria-hidden="true" />}
    </>
  );
}

export function HomeScreen({ onAddWorkout, onImageSelected, onUsePastWorkout, onOpenProfile, onSelectWorkout }: HomeScreenProps) {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const { workouts, loading, refresh } = useWorkouts(500);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const [activeSheetCard, setActiveSheetCard] = useState<CollectionCard | null>(null);
  const [drilldownCard, setDrilldownCard] = useState<CollectionCard | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [captureSheetOpen, setCaptureSheetOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const firstName = user?.displayName?.split(' ')[0] || 'Athlete';
  const streak = user?.stats.currentStreak || 0;
  const latestWorkout = workouts[0];

  const cards = useMemo(() => buildCollectionCards(workouts, streak), [workouts, streak]);

  useEffect(() => {
    if (!shareMessage) return undefined;
    const timer = window.setTimeout(() => setShareMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [shareMessage]);

  const anySheetOpen = captureSheetOpen || !!activeSheetCard || !!drilldownCard;
  useEffect(() => {
    if (anySheetOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [anySheetOpen]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setCaptureSheetOpen(false);
    if (onImageSelected) {
      onImageSelected(file);
      return;
    }
    onAddWorkout();
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardPointerDown = (card: CollectionCard, event: React.PointerEvent) => {
    longPressStartRef.current = { x: event.clientX, y: event.clientY };
    cancelLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      if (!card.locked) {
        setActiveSheetCard(card);
      }
    }, LONG_PRESS_MS);
  };

  const handleCardPointerMove = (event: React.PointerEvent) => {
    if (!longPressStartRef.current) return;
    const dx = Math.abs(event.clientX - longPressStartRef.current.x);
    const dy = Math.abs(event.clientY - longPressStartRef.current.y);
    if (dx > LONG_PRESS_MOVE_PX || dy > LONG_PRESS_MOVE_PX) {
      cancelLongPress();
    }
  };

  const handleCardPointerUp = () => {
    cancelLongPress();
    longPressStartRef.current = null;
  };

  const handleShareCard = async (card: CollectionCard) => {
    const element = cardRefs.current[card.id];
    if (!element) return;
    const result = await shareWorkoutCard(element, card.shareTitle, {
      filename: card.shareTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    });
    setActiveSheetCard(null);
    setShareMessage(result.success ? (result.method === 'share' ? 'Shared' : 'Saved as image') : 'Share failed');
  };

  const openWorkout = (workout: WorkoutWithStats, list: WorkoutWithStats[]) => {
    setDrilldownCard(null);
    onSelectWorkout?.(workout, list);
  };

  const openCaptureSheet = () => {
    setCaptureSheetOpen(true);
  };

  const handleCardClick = (card: CollectionCard) => {
    if (card.locked) return;
    if (card.type === 'capture') {
      openCaptureSheet();
      return;
    }
    if (card.type === 'onboarding' && onUsePastWorkout) {
      onUsePastWorkout();
      return;
    }
    if (card.type === 'recent' && card.workouts[0]) {
      openWorkout(card.workouts[0], workouts);
      return;
    }
    if (card.workouts.length > 0) {
      setDrilldownCard(card);
    }
  };

  const performRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 250);
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const scroller = wallRef.current;
    if (!scroller || scroller.scrollTop > 0 || isRefreshing) return;
    touchStartYRef.current = event.touches[0].clientY;
    isPullingRef.current = true;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isPullingRef.current || touchStartYRef.current == null || isRefreshing) return;
    const delta = event.touches[0].clientY - touchStartYRef.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    setPullDistance(Math.min(110, delta * 0.55));
  };

  const handleTouchEnd = async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    if (pullDistance >= PULL_REFRESH_TRIGGER) {
      await performRefresh();
      return;
    }
    setPullDistance(0);
  };

  const captureLabel = latestWorkout
    ? streak > 0
      ? `${streak}-day streak alive`
      : `Last log ${formatShortDate(latestWorkout.date)}`
    : 'Start the wall with your first log';

  const headerMeta = latestWorkout
    ? `${captureLabel} · ${workouts.length} ${workouts.length === 1 ? 'poster' : 'posters'}`
    : 'Your wall starts with a single workout';

  return (
    <div
      ref={wallRef}
      className={styles.container}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className={styles.hiddenInput}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className={styles.hiddenInput}
      />
      <div className={styles.pullToRefresh} style={{ height: `${pullDistance}px` }}>
        <span className={styles.pullLabel}>
          {isRefreshing ? 'Refreshing wall...' : pullDistance >= PULL_REFRESH_TRIGGER ? 'Release to refresh' : 'Pull for fresh cards'}
        </span>
      </div>

      <div className={styles.layout}>
        <motion.header
          className={styles.header}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className={styles.headerCopy}>
            <p className={styles.kicker}>YOUR WALL</p>
            <h1 className={styles.title}>Hey {firstName}</h1>
            <p className={styles.subtitle}>{headerMeta}</p>
          </div>
          {onOpenProfile && (
            <button type="button" className={styles.avatarButton} onClick={onOpenProfile} aria-label="Open profile">
              {user?.photoUrl ? (
                <img
                  src={`${user.photoUrl}?v=${user.photoUpdatedAt || 0}`}
                  alt={user.displayName}
                  className={styles.avatar}
                />
              ) : (
                <span className={styles.avatarFallback}>{firstName.charAt(0).toUpperCase()}</span>
              )}
            </button>
          )}
        </motion.header>

        <motion.button
          type="button"
          className={styles.captureBanner}
          onClick={openCaptureSheet}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.3 }}
        >
          <span className={styles.captureEyebrow}>ONE TAP AWAY</span>
          <span className={styles.captureTitle}>LOG TODAY&apos;S WOD</span>
          <span className={styles.captureNote}>Scan or photograph the whiteboard</span>
          <span className={styles.captureIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h3l2-2h6l2 2h3v12H4z" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
        </motion.button>

        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner} />
            <p className={styles.loadingText}>Building your wall...</p>
          </div>
        )}

        {!loading && workouts.length === 0 && (
          <section className={styles.emptyState}>
            <p className={styles.kicker}>NO POSTERS YET</p>
            <h2 className={styles.emptyTitle}>Your first WOD becomes the first card on the wall.</h2>
            <p className={styles.emptyText}>Open the camera, log the board, and the collection starts immediately.</p>
          </section>
        )}

        {!loading && cards.length > 0 && (
          <section className={styles.grid}>
            {cards.map((card, index) => {
              const tone = getCardTone(card);
              return (
              <motion.button
                key={card.id}
                type="button"
                className={`${styles.cardButton} ${card.size === 'full' ? styles.spanFull : ''}`}
                onClick={() => handleCardClick(card)}
                onPointerDown={(event) => handleCardPointerDown(card, event)}
                onPointerMove={handleCardPointerMove}
                onPointerUp={handleCardPointerUp}
                onPointerLeave={handleCardPointerUp}
                onContextMenu={(event) => event.preventDefault()}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.02 * index, duration: 0.28 }}
              >
                <article
                  ref={(node) => {
                    cardRefs.current[card.id] = node;
                  }}
                  className={`${styles.card} ${styles[`card${tone.charAt(0).toUpperCase()}${tone.slice(1)}`] ?? ''} ${card.locked ? styles.cardLocked : ''} ${card.type === 'milestone' ? styles.cardMilestone : ''}`}
                  style={{
                    '--card-accent': card.accent,
                    '--card-accent-soft': card.accentSoft,
                    '--card-accent-alt': card.accentAlt,
                  } as React.CSSProperties}
                >
                  <CardPattern pattern={card.pattern} />
                  <div className={styles.cardGlow} aria-hidden="true" />
                  <div className={styles.cardTop}>
                    <span className={styles.cardEyebrow}>{card.eyebrow}</span>
                    {(card.chip || card.isNew) && (
                      <span
                        className={[
                          styles.cardChip,
                          card.isNew ? styles.cardChipNew : '',
                          !card.isNew && card.chipTone === 'yellow' ? styles.cardChipYellow : '',
                          !card.isNew && card.chipTone === 'magenta' ? styles.cardChipMagenta : '',
                          !card.isNew && card.chipTone === 'cyan' ? styles.cardChipCyan : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {card.isNew ? 'NEW CARD' : card.chip}
                      </span>
                    )}
                  </div>

                  <div className={styles.cardHeroBlock}>
                    <div className={styles.cardHeroLine}>
                      <span className={styles.cardHero}>{card.hero}</span>
                      {card.heroUnit && <span className={styles.cardHeroUnit}>{card.heroUnit}</span>}
                    </div>
                    <h2 className={styles.cardTitle}>{card.title}</h2>
                  </div>

                  <div className={styles.cardFooter}>
                    <p className={styles.cardSubtitle}>{card.subtitle}</p>
                    {card.note && <p className={styles.cardNote}>{card.note}</p>}
                  </div>
                </article>
              </motion.button>
              );
            })}
          </section>
        )}
      </div>

      <AnimatePresence>
        {activeSheetCard && (
          <>
            <motion.button
              type="button"
              className={styles.sheetBackdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveSheetCard(null)}
            />
            <motion.div
              className={styles.sheet}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            >
              <p className={styles.sheetEyebrow}>{activeSheetCard.eyebrow}</p>
              <h3 className={styles.sheetTitle}>{activeSheetCard.title}</h3>
              <button type="button" className={styles.sheetAction} onClick={() => handleShareCard(activeSheetCard)}>
                Share this card
              </button>
              {activeSheetCard.workouts.length > 0 && (
                <button
                  type="button"
                  className={styles.sheetAction}
                  onClick={() => {
                    setActiveSheetCard(null);
                    setDrilldownCard(activeSheetCard);
                  }}
                >
                  View contributing WODs
                </button>
              )}
              <button type="button" className={`${styles.sheetAction} ${styles.sheetCancel}`} onClick={() => setActiveSheetCard(null)}>
                Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {captureSheetOpen && (
          <>
            <motion.button
              type="button"
              className={styles.sheetBackdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCaptureSheetOpen(false)}
            />
            <motion.div
              className={styles.sheet}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            >
              <p className={styles.sheetEyebrow}>LOG TODAY'S WOD</p>
              <h3 className={styles.sheetTitle}>Capture the board</h3>
              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => {
                  setCaptureSheetOpen(false);
                  cameraInputRef.current?.click();
                }}
              >
                Take Photo
              </button>
              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => {
                  setCaptureSheetOpen(false);
                  fileInputRef.current?.click();
                }}
              >
                Upload Image
              </button>
              {isAdmin && onUsePastWorkout && (
                <button
                  type="button"
                  className={styles.sheetAction}
                  onClick={() => {
                    setCaptureSheetOpen(false);
                    onUsePastWorkout();
                  }}
                >
                  Load from Recent
                </button>
              )}
              <button type="button" className={`${styles.sheetAction} ${styles.sheetCancel}`} onClick={() => setCaptureSheetOpen(false)}>
                Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drilldownCard && (
          <>
            <motion.button
              type="button"
              className={styles.sheetBackdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrilldownCard(null)}
            />
            <motion.div
              className={`${styles.sheet} ${styles.drilldownSheet}`}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            >
              <div className={styles.drilldownHeader}>
                <div>
                  <p className={styles.sheetEyebrow}>{drilldownCard.eyebrow}</p>
                  <h3 className={styles.sheetTitle}>{drilldownCard.title}</h3>
                  <p className={styles.drilldownCount}>{drilldownCard.workouts.length} contributing WODs</p>
                </div>
                <button type="button" className={styles.closeButton} onClick={() => setDrilldownCard(null)} aria-label="Close">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className={styles.drilldownList}>
                {drilldownCard.workouts.map((workout) => (
                  <button
                    key={`${drilldownCard.id}-${workout.id}`}
                    type="button"
                    className={styles.drilldownRow}
                    onClick={() => openWorkout(workout, drilldownCard.workouts)}
                  >
                    <span className={styles.drilldownDate}>{formatShortDate(workout.date).toUpperCase()}</span>
                    <span className={styles.drilldownBody}>
                      <span className={styles.drilldownName}>{workout.title}</span>
                      <span className={styles.drilldownSummary}>{workoutSummaryLine(workout)}</span>
                    </span>
                    <span className={styles.drilldownChevron}>›</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shareMessage && (
          <motion.div
            className={styles.toast}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            {shareMessage}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
