/**
 * useCelebrationData
 *
 * Extracts all computation/derivation logic from WorkoutScreen into one hook.
 * The component calls this and passes returned values straight to JSX.
 * No rendering decisions live here — only data derivation.
 *
 * Pure helpers used here are exported from WorkoutScreen so both can share
 * a single authoritative implementation until a future cleanup moves them here.
 */

import { useMemo } from 'react';
import type {
  Achievement,
  Exercise,
  MovementTotal,
  PosterSkinId,
  PosterVibeKey,
  WorkloadBreakdown,
  WorkoutFormat,
} from '../types';
import type { RewardData } from '../types';
import type {
  ArtifactSection,
  HeroResult,
  HighlightStampData,
  PosterLayout,
} from '../components/celebration';
import type { WorkoutWithStats } from './useWorkouts';
import { useAuth } from '../context/AuthContext';
import {
  calculateWorkoutEP,
  getTimeCapMinutes,
  DEFAULT_BW,
} from '../utils/xpCalculations';
import {
  calculateWorkloadFromExercises,
  assignMovementColors,
} from '../services/workloadCalculation';
import {
  DEFAULT_CELEBRATION_STICKER_CONFIG,
  type CelebrationStickerConfig,
} from '../services/celebrationStickerConfig';
import {
  // Pure computation functions
  computeHeroResult,
  buildRewardArtifactSections,
  buildPageArtifactSection,
  // Pure helpers re-exported for callers that need them
  detectBarbellComplex,
  getPrescribedRoundCount,
  getPrescriptionRepeatCount,
  inferRoundCountFromMovements,
  getFlexHighlightStamp,
  inferWorkoutFormatForExercise,
  inferTeamSizeFromText,
  getRewardVibeLabel,
  getLadderRungValue,
  stableRotation,
  formatStampLoad,
  formatStickerMovementName,
  shouldLogCelebrationDebug,
  normalizeIntervalNotation,
  formatAmrapRounds,
  formatDistanceValue,
  formatDistanceSplit,
  formatDurationFromSeconds,
  fmtTimeSocial,
  normalizeBlueprint,
  extractEveryXCadence,
  getSectionedMovementRepeatCounts,
  getSectionedForTimeLabel,
  findMovementTotal,
  findBreakdownForParsedMovement,
  parseDescLadderScheme,
  repairUndercountedBreakdown,
  getEngineThresholdStamp,
  BARBELL_PATTERNS,
} from '../components/celebration/helpers';

// Re-export helpers for callers that need them directly
export {
  detectBarbellComplex,
  getPrescribedRoundCount,
  getPrescriptionRepeatCount,
  inferRoundCountFromMovements,
  getFlexHighlightStamp,
  inferWorkoutFormatForExercise,
  inferTeamSizeFromText,
  getRewardVibeLabel,
  getLadderRungValue,
  stableRotation,
  formatStampLoad,
  formatStickerMovementName,
  shouldLogCelebrationDebug,
  normalizeIntervalNotation,
  formatAmrapRounds,
  formatDistanceValue,
  formatDistanceSplit,
  formatDurationFromSeconds,
  fmtTimeSocial,
  normalizeBlueprint,
  extractEveryXCadence,
  getSectionedMovementRepeatCounts,
  getSectionedForTimeLabel,
  findMovementTotal,
  findBreakdownForParsedMovement,
  parseDescLadderScheme,
  repairUndercountedBreakdown,
  getEngineThresholdStamp,
  BARBELL_PATTERNS,
};

// ─── Types ────────────────────────────────────────────────────────────────────

/** One page of a multi-part carousel */
export interface CarouselPage {
  exercise: Exercise;
  movements: MovementTotal[];
  isStrength: boolean;
}

export interface CelebrationData {
  // Raw inputs normalised from both modes
  exercises: Exercise[];
  workoutFormat: WorkoutFormat | undefined;
  rawText: string | undefined;
  durationMinutes: number;
  displayMinutes: number;
  workoutDate: Date;

  // Persisted poster customization (Firestore-backed)
  workoutId: string | undefined;
  posterSkin: PosterSkinId | undefined;
  posterVibe: PosterVibeKey | undefined;

  // Layout decision
  posterLayout: PosterLayout;
  isCarousel: boolean;

  // Hero
  heroResult: HeroResult | null;
  rewardVibeLabel: string;
  rewardDisplayTitle: string;

  // Artifact sections (single-page path)
  artifactSections: ArtifactSection[];

  // Carousel pages (null when single-page)
  carouselPageData: CarouselPage[] | null;
  perPageSections: (ArtifactSection | null)[] | null;
  perPageStamps: (HighlightStampData | null)[] | null;
  perPageHeroResults: HeroResult[] | null;

  // Stickers
  posterHeroStickers: HighlightStampData[];
  effectiveHighlightStamp: HighlightStampData | null;

  // Footer stats
  timeSplit: { num: string; unit: string };
  repsSplit: { num: string; unit: string };
  showTime: boolean;

  // Achievements & ladder
  activeAchievements: Achievement[] | undefined;
  ladderData: { ladderReps: number[]; ladderStep: number; ladderPartial?: number } | null;
  ladderSecondSticker: HighlightStampData | null;

  // Workload
  activeBreakdown: WorkloadBreakdown | null;
  totalReps: number;
  totalVolume: number;
  totalDistance: number;
  totalCalories: number;
  totalWeightedDistance: number;

  // EP
  totalEP: number;
  rewardEP: ReturnType<typeof calculateWorkoutEP> | null;
  detailEP: ReturnType<typeof calculateWorkoutEP> | null;

  // Difficulty
  displayDifficultyLevel: number | undefined;
  difficultyLevel: number | undefined;

  // Partner metadata
  teamSize: number;
  posterPartnerNames: string[];
  squadTagText: string | null;

  // Misc derived flags
  isPR: boolean | undefined;
  isComplex: boolean;
  barbellComplex: ReturnType<typeof detectBarbellComplex>;
  isChipper: boolean;
  descLadderData: { repsPerSet: number[]; setsCompleted: number } | null;
  chipperStickers: { label: string; value: string; note: string }[];
  hasStationEmom: boolean;
}

// ─── Internal pure helpers (not in WorkoutScreen) ─────────────────────────────

function inferPosterDifficultyLevel(params: {
  format?: WorkoutFormat;
  totalVolume: number;
  totalReps: number;
  durationMinutes: number;
  movementCount: number;
}): number | undefined {
  if (!params.format || params.format === 'strength') return undefined;
  let score = 4;
  if (params.durationMinutes > 0 && params.durationMinutes <= 12) score += 1;
  if (params.totalReps >= 250) score += 1;
  if (params.totalReps >= 550) score += 1;
  if (params.totalVolume >= 5000) score += 1;
  if (params.totalVolume >= 10000) score += 1;
  if (params.movementCount >= 3) score += 1;
  return Math.max(1, Math.min(10, score));
}

function normalizeStampMovementName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function achievementMatchesMovementList(
  achievement: NonNullable<RewardData['achievements']>[number],
  movements: MovementTotal[],
): boolean {
  if (!achievement.movement) return false;
  const achievementName = normalizeStampMovementName(achievement.movement);
  return movements.some((m) => {
    const movementName = normalizeStampMovementName(m.name);
    return (
      movementName === achievementName
      || movementName.includes(achievementName)
      || achievementName.includes(movementName)
    );
  });
}

/**
 * Is this exercise one of the session's main parts (vs. a secondary/auxiliary block like a
 * warm-up or body-armor circuit)? Trusts the AI's explicit `isSecondary` when present; for
 * older data that predates the field, falls back to the `type !== 'skill'` proxy.
 */
function isMainPart(ex: Exercise): boolean {
  if (typeof ex.isSecondary === 'boolean') return !ex.isSecondary;
  return ex.type !== 'skill';
}

// ─── The hook ─────────────────────────────────────────────────────────────────

export function useCelebrationData(
  mode: 'reward' | 'detail',
  rewardData: RewardData | undefined,
  workout: WorkoutWithStats | undefined,
  stickerConfig: CelebrationStickerConfig = DEFAULT_CELEBRATION_STICKER_CONFIG,
): CelebrationData {
  const { user } = useAuth();
  const isReward = mode === 'reward';

  // ── Basic normalisation ───────────────────────────────────────────────────

  const exercises: Exercise[] = isReward
    ? (rewardData?.exercises ?? [])
    : (workout?.exercises ?? []);

  const workoutFormat: WorkoutFormat | undefined = isReward
    ? rewardData?.workoutSummary?.format
    : workout?.format;

  const rawText: string | undefined = isReward
    ? rewardData?.workoutRawText
    : (workout?.rawText ?? (() => {
        if (!workout?.exercises?.length) return undefined;
        return workout.exercises.map((ex) => `${ex.name}\n${ex.prescription}`).join('\n\n');
      })());

  const isPR: boolean | undefined = isReward
    ? rewardData?.heroAchievement?.type === 'pr'
    : workout?.isPR;

  // The workout's actual date — never "now at render time". Reward mode carries it on
  // rewardData (set at save time); detail mode reads the persisted Firestore field.
  const workoutDate: Date = (isReward ? rewardData?.date : workout?.date) ?? new Date();

  // ── Poster customization (persisted to Firestore) ──────────────────────────

  const workoutId: string | undefined = isReward ? rewardData?.workoutId : workout?.id;
  const posterSkin: PosterSkinId | undefined = workout?.posterSkin;
  const posterVibe: PosterVibeKey | undefined = workout?.posterVibe;

  const activeAchievements: Achievement[] | undefined = isReward
    ? rewardData?.achievements
    : workout?.achievements;

  // ── Duration ─────────────────────────────────────────────────────────────

  const durationMinutes: number = isReward
    ? (rewardData?.workoutSummary?.duration ?? 0)
    : (workout?.duration ?? (() => {
        let secs = 0;
        workout?.exercises?.forEach((ex) =>
          ex.sets?.forEach((s) => { if (s.time) secs += s.time; }),
        );
        return secs > 0 ? Math.round(secs / 60) : 0;
      })());

  const displayMinutes: number = isReward
    ? (rewardData?.workoutSummary?.actualTimeMinutes ?? durationMinutes)
    : durationMinutes;

  // ── Workload breakdown ────────────────────────────────────────────────────

  const activeBreakdown = useMemo((): WorkloadBreakdown | null => {
    const sourceExercises = isReward ? rewardData?.exercises : workout?.exercises;
    if (isReward) {
      const rewardBreakdown = rewardData?.workloadBreakdown;
      return rewardBreakdown && sourceExercises
        ? repairUndercountedBreakdown(rewardBreakdown, sourceExercises)
        : rewardBreakdown ?? null;
    }
    if (workout?.workloadBreakdown) {
      const stored = workout.workloadBreakdown;
      const enrichedMovements = stored.movements.map((mov) => {
        const enriched = { ...mov };
        if (workout.exercises) {
          for (const ex of workout.exercises) {
            const isDirectMatch = ex.name.toLowerCase() === mov.name.toLowerCase();
            const isSingleMovementMatch =
              (ex.movements?.length ?? 0) === 1
              && ex.movements?.[0]?.name.toLowerCase() === mov.name.toLowerCase();
            if (isDirectMatch || isSingleMovementMatch) {
              const perSetWeights: number[] = [];
              let setVolume = 0;
              let setReps = 0;
              for (const set of ex.sets) {
                if (set.weight) {
                  perSetWeights.push(set.weight);
                  setVolume += set.weight * (set.actualReps ?? 0);
                  setReps += set.actualReps ?? 0;
                }
              }
              if (
                perSetWeights.length > 1
                && !perSetWeights.every((w) => w === perSetWeights[0])
              ) {
                enriched.weightProgression = perSetWeights;
                if (setReps > 0 && setVolume > 0) {
                  enriched.weight = setVolume / setReps;
                }
              }
              break;
            }
          }
        }
        return enriched;
      });
      const enrichedBreakdown: WorkloadBreakdown = {
        ...stored,
        movements: assignMovementColors(enrichedMovements),
      };
      return sourceExercises
        ? repairUndercountedBreakdown(enrichedBreakdown, sourceExercises)
        : enrichedBreakdown;
    }
    if (workout?.exercises && workout.exercises.length > 0) {
      const partnerFactor = workout.partnerFactor ?? (workout.partnerWorkout ? 0.5 : 1);
      const breakdown = calculateWorkloadFromExercises(workout.exercises, undefined, partnerFactor);
      breakdown.movements = assignMovementColors(breakdown.movements);
      return repairUndercountedBreakdown(breakdown, workout.exercises);
    }
    return null;
  }, [
    isReward,
    rewardData?.workloadBreakdown,
    rewardData?.exercises,
    workout?.exercises,
    workout?.partnerWorkout,
    workout?.partnerFactor,
    workout?.workloadBreakdown,
  ]);

  // ── Totals ────────────────────────────────────────────────────────────────

  const baseVolume: number = isReward
    ? (() => {
        const bd = activeBreakdown;
        const stored = bd?.grandTotalVolume ?? rewardData?.workoutSummary?.totalVolume ?? 0;
        if (!bd?.movements?.length) return stored;
        const freshVolume = bd.movements.reduce(
          (s, m) =>
            m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0
              ? s + m.weight * m.totalReps
              : s,
          0,
        );
        const weightedCount = bd.movements.filter((m) => (m.weight ?? 0) > 0).length;
        const allCount = bd.movements.length;
        const allBarbell = bd.movements.every((m) =>
          BARBELL_PATTERNS.some((p) => m.name.toLowerCase().includes(p)),
        );
        if (allBarbell && weightedCount > 0 && weightedCount < allCount && freshVolume > 0) {
          return Math.round((freshVolume / weightedCount) * allCount);
        }
        return freshVolume > 0 ? freshVolume : stored;
      })()
    : (() => {
        const freshVolume =
          activeBreakdown?.movements?.reduce(
            (s, m) =>
              m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0
                ? s + m.weight * m.totalReps
                : s,
            0,
          ) ?? 0;
        return freshVolume > 0 ? Math.round(freshVolume) : (workout?.totalVolume ?? 0);
      })();

  const totalReps: number = isReward
    ? (activeBreakdown?.grandTotalReps ?? rewardData?.workoutSummary?.totalReps ?? 0)
    : (activeBreakdown?.grandTotalReps ?? workout?.totalReps ?? 0);

  const totalDistance: number = activeBreakdown?.grandTotalDistance ?? 0;
  const totalWeightedDistance: number = activeBreakdown?.grandTotalWeightedDistance ?? 0;
  const totalCalories: number = activeBreakdown?.grandTotalCalories ?? 0;

  // ── Barbell complex ───────────────────────────────────────────────────────

  const barbellComplex = useMemo(() => {
    const movements = activeBreakdown?.movements ?? [];
    if (!movements.length) return null;
    const prescribedRounds = getPrescribedRoundCount(exercises, rawText);
    const stampRounds =
      exercises.length === 1
        ? (prescribedRounds
            ?? exercises[0]?.sets?.filter((s) => s.completed)?.length
            ?? exercises[0]?.sets?.length
            ?? 1)
        : 1;
    return detectBarbellComplex(movements, stampRounds);
  }, [activeBreakdown?.movements, exercises, rawText]);

  const isComplex = barbellComplex !== null;

  const complexTonnage = useMemo((): number | null => {
    if (!barbellComplex) return null;
    const ex = exercises[0];
    if (!ex?.sets?.length) return null;
    const weightSum = ex.sets.reduce((sum, set) => sum + (set.weight ?? 0), 0);
    if (weightSum <= 0) return null;
    const movReps = (activeBreakdown?.movements ?? []).map((m) => {
      if (m.totalReps && barbellComplex.totalRounds > 0) {
        return Math.max(1, Math.round(m.totalReps / barbellComplex.totalRounds));
      }
      return 1;
    });
    const repsPerComplex =
      movReps.length > 0
        ? movReps.reduce((sum, r) => sum + r, 0)
        : barbellComplex.repsPerRound;
    return Math.round(weightSum * repsPerComplex);
  }, [barbellComplex, exercises, activeBreakdown?.movements]);

  const totalVolume = complexTonnage ?? baseVolume;

  // ── EP ────────────────────────────────────────────────────────────────────

  const bodyweight = user?.weight ?? DEFAULT_BW;

  const _rawDifficultyLevel = isReward
    ? rewardData?.difficultyLevel
    : workout?.difficultyLevel;
  const _difficultyFormat = isReward
    ? rewardData?.workoutSummary?.format
    : workout?.format;
  const difficultyLevel = _difficultyFormat === 'strength' ? undefined : _rawDifficultyLevel;

  const displayDifficultyLevel = difficultyLevel ?? inferPosterDifficultyLevel({
    format: _difficultyFormat,
    totalVolume,
    totalReps,
    durationMinutes,
    movementCount: activeBreakdown?.movements?.length ?? 0,
  });

  const rewardEP = isReward
    ? calculateWorkoutEP(
        totalVolume,
        durationMinutes,
        bodyweight,
        isPR ?? false,
        activeBreakdown?.movements,
        rewardData?.workoutSummary?.actualTimeMinutes,
        difficultyLevel,
      )
    : null;

  const detailEP =
    !isReward && workout
      ? calculateWorkoutEP(
          workout.totalVolume,
          getTimeCapMinutes(workout),
          bodyweight,
          workout.isPR ?? false,
          workout.workloadBreakdown?.movements,
          undefined,
          difficultyLevel,
        )
      : null;

  const totalEP = isReward ? (rewardEP?.total ?? 0) : (detailEP?.total ?? 0);

  // ── Ladder ────────────────────────────────────────────────────────────────

  const ladderData = useMemo((): {
    ladderReps: number[];
    ladderStep: number;
    ladderPartial?: number;
  } | null => {
    const amrapEx = exercises.find((ex) => ex.ladderReps && ex.ladderReps.length > 0);
    if (!amrapEx) return null;
    const reps = amrapEx.ladderReps!;

    let step: number | null =
      amrapEx.ladderStep != null && amrapEx.ladderStep > 0 ? amrapEx.ladderStep : null;

    if (!step) {
      const refMovement = (activeBreakdown?.movements ?? []).find((m) => (m.totalReps ?? 0) > 0);
      if (refMovement?.totalReps) {
        let sum = 0;
        for (let i = 0; i < 60; i++) {
          sum += getLadderRungValue(reps, i);
          if (sum === refMovement.totalReps) { step = i + 1; break; }
          if (sum > refMovement.totalReps) break;
        }
      }
    }

    if (!step) return null;
    return { ladderReps: reps, ladderStep: step, ladderPartial: amrapEx.ladderPartial };
  }, [exercises, activeBreakdown?.movements]);

  // ── Chipper ───────────────────────────────────────────────────────────────

  const hasStationEmom = exercises.some((ex) => ex.movements?.some((m) => m.stationLabel));

  const chipperMovementCount = exercises.reduce((count, exercise) => {
    if (exercise.sections?.length) {
      return count + exercise.sections.reduce((s, sec) => s + (sec.movements?.length ?? 0), 0);
    }
    return count + (exercise.movements?.length ?? 0);
  }, 0);

  const chipperSourceText = [
    workoutFormat ?? '',
    workout?.format ?? '',
    rewardData?.workoutSummary?.format ?? '',
    rawText ?? '',
    ...exercises.map((ex) => `${ex.name ?? ''} ${ex.prescription ?? ''}`),
  ].join(' ');

  const hasForTimePrescription =
    /for\s*time|\brft\b|\b\d+\s*rounds?\s+for\s+time\b/i.test(chipperSourceText);

  const isChipper =
    !ladderData
    && hasForTimePrescription
    && chipperMovementCount > 1
    && exercises.every((ex) => ex.type !== 'strength' && ex.type !== 'skill');

  const descLadderData = useMemo((): { repsPerSet: number[]; setsCompleted: number } | null => {
    if (!isChipper) return null;
    const ex = exercises[0];
    const scheme = ex ? parseDescLadderScheme(ex, rawText) : undefined;
    if (!scheme) return null;
    return {
      repsPerSet: scheme,
      setsCompleted: ex?.rounds && ex.rounds <= scheme.length ? ex.rounds : scheme.length,
    };
  }, [isChipper, exercises, rawText]);

  const chipperStickers = useMemo((): { label: string; value: string; note: string }[] => {
    if (!isChipper) return [];
    const stickers: { label: string; value: string; note: string }[] = [];
    const allBreakdown = activeBreakdown?.movements ?? [];
    const chipperMoveMinutes = isReward
      ? (rewardData?.workoutSummary?.actualTimeMinutes ?? displayMinutes)
      : displayMinutes;
    if (chipperMoveMinutes > stickerConfig.chipperMoveTimeStickerMinMinutes) {
      stickers.push({
        label: 'CHIPPER',
        value: fmtTimeSocial(Math.max(0, Math.round(chipperMoveMinutes * 60))),
        note: 'MOVE TIME',
      });
    }

    const engineThreshold = getEngineThresholdStamp(allBreakdown, stickerConfig);
    if (engineThreshold) {
      stickers.push({
        label: engineThreshold.title,
        value: engineThreshold.value,
        note: engineThreshold.note,
      });
    }

    const topWeightedFromBreakdown = [...allBreakdown]
      .filter((m) => (m.totalReps ?? 0) > 0 && (m.weight ?? 0) > 0)
      .sort(
        (a, b) =>
          ((b.totalReps ?? 0) * (b.weight ?? 0)) - ((a.totalReps ?? 0) * (a.weight ?? 0)),
      )[0];

    const topWeightedFromScheme = (() => {
      if (!descLadderData) return null;
      const exercise = exercises[0];
      const schemeTotal = descLadderData.repsPerSet
        .slice(0, descLadderData.setsCompleted)
        .reduce((s, r) => s + r, 0);
      type WCandidate = { name: string; totalReps: number; weight: number; unit: MovementTotal['unit'] };
      const candidates: WCandidate[] = (
        exercise?.movements
          ?.map((movement) => {
            const actual = findBreakdownForParsedMovement(movement, allBreakdown);
            const weight =
              actual?.weight ?? movement.rxWeights?.male ?? movement.rxWeights?.female;
            if (!weight || weight <= 0) return null;
            const isSchemeMovement =
              movement.reps != null && descLadderData.repsPerSet.includes(movement.reps);
            const totalReps =
              actual?.totalReps ?? (isSchemeMovement ? schemeTotal : undefined);
            if (!totalReps || totalReps <= 0) return null;
            return {
              name: actual?.name ?? movement.name,
              totalReps,
              weight,
              unit: actual?.unit ?? movement.rxWeights?.unit ?? 'kg',
            } as WCandidate;
          })
          .filter((x): x is WCandidate => x !== null) ?? []
      );
      return candidates.sort((a, b) => b.totalReps * b.weight - a.totalReps * a.weight)[0] ?? null;
    })();

    const topWeighted = topWeightedFromBreakdown ?? topWeightedFromScheme;
    if (topWeighted?.totalReps && topWeighted.weight) {
      const unit = topWeighted.unit === 'lb' ? 'LB' : 'KG';
      stickers.push({
        label: 'WORKHORSE',
        value: `${topWeighted.totalReps}`,
        note: `${formatStickerMovementName(topWeighted.name)} @${topWeighted.weight}${unit}`,
      });
    }

    const topCalorie = [...allBreakdown]
      .filter((m) => (m.totalCalories ?? 0) > stickerConfig.calorieStickerMinCalories)
      .sort((a, b) => (b.totalCalories ?? 0) - (a.totalCalories ?? 0))[0];
    if (topCalorie?.totalCalories && engineThreshold?.title !== 'CAL BURN') {
      stickers.push({
        label: 'TOTAL CALS.',
        value: `${topCalorie.totalCalories}`,
        note: topCalorie.name.toUpperCase(),
      });
    }

    return stickers;
  }, [
    isChipper,
    exercises,
    activeBreakdown?.movements,
    descLadderData,
    isReward,
    rewardData?.workoutSummary?.actualTimeMinutes,
    displayMinutes,
    stickerConfig,
  ]);

  // ── Poster layout ─────────────────────────────────────────────────────────

  // Multi-part wins over the single-exercise special layouts (chipper/complex/ladder) — those
  // are shaping concerns for ONE exercise's own page, not a reason to collapse a session with
  // multiple main parts (e.g. strength + metcon) into one combined poster. The carousel's
  // per-page builders already handle ladder/chipper/complex shaping for whichever page needs it.
  const posterLayout: PosterLayout = (() => {
    if (exercises.filter(isMainPart).length > 1) return 'multi-part';
    if (isChipper) return 'chipper';
    if (barbellComplex) return 'complex';
    if (ladderData) return 'ladder';
    return 'standard';
  })();

  const isCarousel = posterLayout === 'multi-part';

  // ── Carousel page data ────────────────────────────────────────────────────

  const carouselPageData = useMemo((): CarouselPage[] | null => {
    if (posterLayout !== 'multi-part') return null;
    const allMovements = activeBreakdown?.movements ?? [];

    return exercises.filter(isMainPart).map((ex): CarouselPage => {
      const isStrength = ex.type === 'strength' || ex.type === 'skill';
      const exNameLower = ex.name.toLowerCase();
      const subNames = new Set((ex.movements ?? []).map((m) => m.name.toLowerCase()));

      const fromBreakdown = allMovements.filter((m) => {
        const mn = m.name.toLowerCase();
        const orig = m.originalMovement?.toLowerCase();
        return mn === exNameLower || subNames.has(mn) || (orig != null && subNames.has(orig));
      });

      if (fromBreakdown.length > 0) return { exercise: ex, movements: fromBreakdown, isStrength };

      const sets = ex.sets ?? [];
      const weightedSets = sets
        .filter((s) => s.weight && s.weight > 0)
        .map((s) => ({ weight: s.weight!, reps: s.actualReps ?? s.targetReps ?? 0 }));

      if (weightedSets.length > 0) {
        const wsReps = weightedSets.reduce((sum, s) => sum + s.reps, 0);
        const weights = weightedSets.map((s) => s.weight);
        const hasVarying = weights.length > 1 && !weights.every((w) => w === weights[0]);
        const weightProgression = hasVarying ? weights : undefined;
        const avgWeight =
          hasVarying && wsReps > 0
            ? weightedSets.reduce((sum, s) => sum + s.weight * s.reps, 0) / wsReps
            : weights[0];
        const derived: MovementTotal = {
          name: ex.name,
          totalReps: wsReps > 0 ? wsReps : undefined,
          weight: avgWeight,
          weightProgression,
          unit: 'kg',
          color: 'yellow',
        };
        return { exercise: ex, movements: [derived], isStrength };
      }

      const metconMovements = allMovements.filter((m) => subNames.has(m.name.toLowerCase()));
      return { exercise: ex, movements: metconMovements, isStrength };
    });
  }, [posterLayout, exercises, activeBreakdown?.movements]);

  // ── Hero result ───────────────────────────────────────────────────────────

  const heroResult = useMemo((): HeroResult | null => {
    const prAch = activeAchievements?.find((a) => a.type === 'pr' && a.movement && a.value);
    const prMovementName = prAch?.movement;
    const prWeight = prAch?.value;
    const teamSize = isReward
      ? (rewardData?.teamSize ?? workout?.teamSize)
      : workout?.teamSize;
    const movements = activeBreakdown?.movements ?? [];
    const heroRawText = isReward ? rewardData?.workoutRawText : workout?.rawText;
    // Only reached when there's at most 1 main part — exclude any secondary exercise (e.g. a
    // warm-up) so it can never be mistaken for "the metcon" just because it comes first and
    // isn't type:'strength'.
    const mainExercises = exercises.filter(isMainPart);

    return computeHeroResult(
      mainExercises.length > 0 ? mainExercises : exercises,
      workoutFormat,
      totalVolume,
      totalEP,
      durationMinutes,
      isPR ?? false,
      movements,
      undefined,
      prMovementName,
      prWeight,
      teamSize,
      heroRawText,
    );
  }, [
    isReward,
    rewardData,
    workout,
    exercises,
    totalVolume,
    totalEP,
    durationMinutes,
    isPR,
    activeBreakdown,
    activeAchievements,
    workoutFormat,
  ]);

  // ── Vibe label & display title ────────────────────────────────────────────

  const rewardVibeLabel = useMemo(
    () =>
      getRewardVibeLabel(
        workoutFormat,
        totalReps,
        durationMinutes,
        totalDistance,
        totalCalories,
        !!(ladderData && ladderData.ladderStep > 0),
      ),
    [workoutFormat, totalReps, durationMinutes, totalDistance, totalCalories, ladderData],
  );

  const baseTitle = isReward
    ? (rewardData?.workoutSummary?.title ?? 'Workout')
    : (workout?.title ?? 'Workout');
  const rewardDisplayTitle =
    isReward && /^today'?s workout$/i.test(baseTitle.trim()) ? '' : baseTitle;

  // ── Stickers ──────────────────────────────────────────────────────────────

  const highlightStamp = useMemo(
    () =>
      getFlexHighlightStamp(
        activeBreakdown?.movements ?? [],
        activeAchievements,
        exercises,
        workoutFormat,
        durationMinutes,
        undefined,
        stickerConfig,
      ),
    [
      activeBreakdown?.movements,
      activeAchievements,
      exercises,
      workoutFormat,
      durationMinutes,
      stickerConfig,
    ],
  );

  const effectiveHighlightStamp = useMemo((): HighlightStampData | null => {
    if (ladderData && ladderData.ladderStep > 0) {
      const peakRung = getLadderRungValue(ladderData.ladderReps, ladderData.ladderStep - 1);
      return {
        title: 'MAX EFFORT',
        value: `${peakRung}`,
        note: 'PEAK ROUND',
        color: 'magenta',
        rotation: -3,
      };
    }
    if (heroResult?.unit === 'CAL' && /CAL BURN|ENGINE/i.test(highlightStamp?.title ?? '')) {
      return null;
    }
    return highlightStamp;
  }, [ladderData, highlightStamp, heroResult]);

  const posterStickers = useMemo((): HighlightStampData[] => {
    const seen = new Set<string>();
    const stickers: HighlightStampData[] = [];
    (activeAchievements ?? [])
      .filter((a) => a.type === 'pr' && a.movement && a.value)
      .forEach((a, index) => {
        const movement = a.movement ?? '';
        const value = a.value ?? 0;
        const key = `${movement.toLowerCase()}-${value}`;
        if (seen.has(key)) return;
        seen.add(key);
        stickers.push({
          title: '★ NEW PR ★',
          value: formatStampLoad(value),
          note: movement.toUpperCase(),
          color: 'yellow',
          rotation: stableRotation(key, index),
        });
      });

    if (stickers.length === 0 && effectiveHighlightStamp) {
      stickers.push({
        ...effectiveHighlightStamp,
        color: 'yellow',
        rotation: stableRotation(
          `${effectiveHighlightStamp.title}-${effectiveHighlightStamp.note}`,
          0,
        ),
      });
    }
    return stickers;
  }, [activeAchievements, effectiveHighlightStamp]);

  const ladderSecondSticker = useMemo((): HighlightStampData | null => {
    if (!ladderData && !descLadderData) return null;
    const allMovements = activeBreakdown?.movements ?? [];
    const topWeighted = [...allMovements]
      .filter((m) => (m.weight ?? 0) > 0 && (m.totalReps ?? 0) > 0)
      .sort(
        (a, b) =>
          ((b.weight ?? 0) * (b.totalReps ?? 0)) - ((a.weight ?? 0) * (a.totalReps ?? 0)),
      )[0];
    if (topWeighted?.totalReps && topWeighted?.weight) {
      const shortName = topWeighted.name
        .replace(/\bAlt(?:'|ernating)?\b/gi, '')
        .replace(/\bSingle\b/gi, '')
        .replace(/\bDumbbell\b/gi, 'DB')
        .replace(/\bKettlebell\b/gi, 'KB')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
      const unit = topWeighted.unit === 'lb' ? 'LB' : 'KG';
      return {
        title: 'LOADED REPS',
        value: `${topWeighted.totalReps} REPS`,
        note: `${shortName} @${topWeighted.weight}${unit}`,
        color: 'yellow',
        rotation: 2,
      };
    }
    return null;
  }, [ladderData, descLadderData, activeBreakdown?.movements]);

  const posterHeroStickers = useMemo((): HighlightStampData[] => {
    const seen = new Set<string>();
    const stickers: HighlightStampData[] = [];
    const add = (stamp: HighlightStampData | null | undefined) => {
      if (!stamp) return;
      const key = `${stamp.title}-${stamp.value}-${stamp.note}`;
      if (seen.has(key)) return;
      seen.add(key);
      stickers.push(stamp);
    };
    posterStickers.forEach(add);
    add(ladderSecondSticker);
    return stickers;
  }, [posterStickers, ladderSecondSticker]);

  // ── Artifact sections ─────────────────────────────────────────────────────

  const artifactSections = useMemo(
    () => {
      // Only reached when there's at most 1 main part — but a secondary exercise (e.g. a
      // warm-up) could still be exercises[0] if it comes first in the array. Exclude it so
      // buildRewardArtifactSections' mainExercise is always the actual main part, not whichever
      // exercise happens to be listed first.
      const mainExercises = exercises.filter(isMainPart);
      // Explicit AI-set field only — matches posterTeamSize below (the value that actually
      // drives the poster's visible partner gate). No text-inference fallback here: this feeds
      // partner-split DISPLAY decisions, and an inferred teamSize disagreeing with the value the
      // rest of the poster trusts is exactly how a solo-looking poster could get partner-shaped
      // row math from a stray "partner" mention elsewhere in rawText.
      const teamSize = rewardData?.teamSize ?? workout?.teamSize;
      return buildRewardArtifactSections(
        mainExercises.length > 0 ? mainExercises : exercises,
        activeBreakdown?.movements ?? [],
        rawText,
        workoutFormat,
        teamSize,
      );
    },
    [exercises, activeBreakdown?.movements, rawText, workoutFormat, rewardData?.teamSize, workout?.teamSize],
  );

  // ── Per-page carousel data ────────────────────────────────────────────────

  const perPageStamps = useMemo((): (HighlightStampData | null)[] | null => {
    if (!carouselPageData) return null;
    return carouselPageData.map((page) =>
      getFlexHighlightStamp(
        page.movements,
        activeAchievements,
        [page.exercise],
        inferWorkoutFormatForExercise(page.exercise, workoutFormat),
        durationMinutes,
        !page.isStrength,
        stickerConfig,
      ),
    );
  }, [carouselPageData, activeAchievements, workoutFormat, durationMinutes, stickerConfig]);

  const perPageHeroResults = useMemo((): HeroResult[] | null => {
    if (!carouselPageData) return null;
    const teamSize =
      rewardData?.teamSize ?? workout?.teamSize ?? inferTeamSizeFromText(rawText);

    return carouselPageData.map((page): HeroResult => {
      const pagePr = (activeAchievements ?? []).find(
        (a) =>
          a.type === 'pr'
          && a.movement
          && a.value
          && achievementMatchesMovementList(a, page.movements),
      );
      const pageFormat = inferWorkoutFormatForExercise(page.exercise, workoutFormat);
      const pageDurationMinutes = Math.max(
        0,
        ...page.exercise.sets
          .map((s) => s.time ?? 0)
          .filter((t) => t > 0)
          .map((t) => t / 60),
      );
      const pageVolume = page.movements.reduce(
        (sum, m) => sum + ((m.weight ?? 0) * (m.totalReps ?? 0)),
        0,
      );
      return computeHeroResult(
        [page.exercise],
        pageFormat,
        pageVolume,
        0,
        pageDurationMinutes,
        Boolean(pagePr),
        page.movements,
        undefined,
        pagePr?.movement,
        pagePr?.value,
        teamSize,
        `${page.exercise.name ?? ''}\n${page.exercise.prescription ?? ''}`,
      );
    });
  }, [
    carouselPageData,
    activeAchievements,
    workoutFormat,
    rewardData?.teamSize,
    workout?.teamSize,
    durationMinutes,
    rawText,
  ]);

  const perPageSections = useMemo((): (ArtifactSection | null)[] | null => {
    if (!carouselPageData) return null;
    const teamSize =
      rewardData?.teamSize ?? workout?.teamSize ?? inferTeamSizeFromText(rawText);
    // rawText is shared across every page/part of the workout — only safe to pass through when
    // there's exactly one page. Otherwise each page must rely on its own exercise.rawText
    // (handled inside parseDescLadderScheme), so one part's text never matches a sibling part's.
    const scopedRawText = carouselPageData.length === 1 ? rawText : undefined;
    return carouselPageData.map((page) =>
      buildPageArtifactSection(
        page.exercise,
        page.movements,
        page.isStrength,
        scopedRawText,
        teamSize,
      ),
    );
  }, [carouselPageData, rawText, rewardData?.teamSize, workout?.teamSize]);

  // ── Footer stats ──────────────────────────────────────────────────────────

  const recordedCompletionSeconds =
    workoutFormat === 'for_time'
      ? exercises
          .filter((ex) => ex.type !== 'strength')
          .flatMap((ex) => ex.sets ?? [])
          .find((s) => (s.time ?? 0) > 0)?.time ?? 0
      : 0;

  const totalSeconds = isReward ? Math.round(displayMinutes * 60) : 0;

  const timeSplit: { num: string; unit: string } = isReward
    ? formatDurationFromSeconds(totalSeconds)
    : recordedCompletionSeconds > 0
      ? formatDurationFromSeconds(recordedCompletionSeconds)
      : (() => {
          if (durationMinutes === 0) return { num: '—', unit: '' };
          if (durationMinutes < 60) return { num: `${durationMinutes}`, unit: 'min' };
          const hrs = Math.floor(durationMinutes / 60);
          const mins = durationMinutes % 60;
          return mins > 0
            ? { num: `${hrs}h ${mins}`, unit: 'min' }
            : { num: `${hrs}`, unit: 'h' };
        })();

  const showTime = durationMinutes > 0 || recordedCompletionSeconds > 0;
  const repsSplit = formatDistanceSplit(totalReps);

  // ── Partner metadata ──────────────────────────────────────────────────────

  const posterTeamSize = rewardData?.teamSize ?? workout?.teamSize ?? 0;
  const isPosterTeam = posterTeamSize > 1;
  const posterPartnerNames: string[] = rewardData?.partnerNames ?? workout?.partnerNames ?? [];
  const squadTagText: string | null = isPosterTeam
    ? [
        `TEAM OF ${posterTeamSize}`,
        posterPartnerNames.length > 0
          ? `WITH: ${posterPartnerNames.map((n) => n.toUpperCase()).join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join(' • ')
    : null;

  // ─────────────────────────────────────────────────────────────────────────

  return {
    exercises,
    workoutFormat,
    rawText,
    durationMinutes,
    displayMinutes,
    workoutDate,
    workoutId,
    posterSkin,
    posterVibe,
    posterLayout,
    isCarousel,
    heroResult,
    rewardVibeLabel,
    rewardDisplayTitle,
    artifactSections,
    carouselPageData,
    perPageSections,
    perPageStamps,
    perPageHeroResults,
    posterHeroStickers,
    effectiveHighlightStamp,
    timeSplit,
    repsSplit,
    showTime,
    activeAchievements,
    ladderData,
    ladderSecondSticker,
    activeBreakdown,
    totalReps,
    totalVolume,
    totalDistance,
    totalCalories,
    totalWeightedDistance,
    totalEP,
    rewardEP,
    detailEP,
    displayDifficultyLevel,
    difficultyLevel,
    teamSize: posterTeamSize || 1,
    posterPartnerNames,
    squadTagText,
    isPR,
    isComplex,
    barbellComplex,
    isChipper,
    descLadderData,
    chipperStickers,
    hasStationEmom,
  };
}
