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
  PosterSticker,
  PosterVibeKey,
  PosterVibeOffset,
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
  buildPageArtifactSections,
  isStrengthPagePart,
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
  parseDescLadderScheme,
  repairUndercountedBreakdown,
  getEngineThresholdStamp,
  BARBELL_PATTERNS,
} from '../components/celebration/helpers';
import { achievementMatchesMovementList } from '../components/celebration/faces/HandwrittenFace/posterData';

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
  // DISPLAY format: when the poster leads with exactly one main part, this is that part's own
  // format (loggingMode-first) — NOT necessarily the persisted session `format`, which is only
  // authoritative for EP/aggregate math and can describe a different (secondary) part.
  workoutFormat: WorkoutFormat | undefined;
  rawText: string | undefined;
  durationMinutes: number;
  displayMinutes: number;
  workoutDate: Date;
  sourceDate: string | undefined;

  // Persisted poster customization (Firestore-backed)
  workoutId: string | undefined;
  posterSkin: PosterSkinId | undefined;
  posterVibe: PosterVibeKey | undefined;
  posterSticker: PosterSticker | undefined;
  posterVibeOffset: PosterVibeOffset | undefined;

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
  perPageSections: ArtifactSection[][] | null;
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

function toIsoCalendarDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return undefined;
  }
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function normalizeSourceDate(value: string | undefined, fallbackYear: number): string | undefined {
  if (!value) return undefined;
  const iso = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return toIsoCalendarDate(parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10));
  }
  const slash = value.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?\b/);
  if (!slash) return undefined;
  const day = parseInt(slash[1], 10);
  const month = parseInt(slash[2], 10);
  const rawYear = slash[3] ? parseInt(slash[3], 10) : fallbackYear;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return toIsoCalendarDate(year, month, day);
}

function extractSourceDateFromRawText(rawText: string | undefined, fallbackYear: number): string | undefined {
  if (!rawText) return undefined;
  for (const line of rawText.split('\n').map((item) => item.trim())) {
    if (!/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?)\b/.test(line)) continue;
    const normalized = normalizeSourceDate(line, fallbackYear);
    if (normalized) return normalized;
  }
  return undefined;
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

/**
 * Is this exercise one of the session's main parts (vs. a secondary/auxiliary block like a
 * warm-up or body-armor circuit)? Trusts the AI's explicit `isSecondary` when present; for
 * older data that predates the field, falls back to the `type !== 'skill'` proxy.
 */
function isMainPart(ex: Exercise): boolean {
  if (typeof ex.isSecondary === 'boolean') return !ex.isSecondary;
  return ex.type !== 'skill';
}

/**
 * Movements from the workload breakdown that belong to the given exercises (matched by
 * exercise name, prescribed movement names, or substitution origin). Parts are standalone
 * practices: a poster section rendering one part must never receive a sibling part's movements.
 */
function movementsForExercises(target: Exercise[], all: MovementTotal[]): MovementTotal[] {
  const names = new Set<string>();
  for (const ex of target) {
    names.add(ex.name.toLowerCase());
    const prescribed = ex.sections?.length
      ? ex.sections.flatMap((section) => section.movements ?? [])
      : (ex.movements ?? []);
    for (const m of prescribed) names.add(m.name.toLowerCase());
  }
  const scoped = all.filter((m) =>
    names.has(m.name.toLowerCase())
    || (m.originalMovement != null && names.has(m.originalMovement.toLowerCase())),
  );
  // Name-matching failed entirely (aliases, renames) — a wrongly-empty poster is worse than
  // the unscoped list, so fall back rather than render nothing.
  return scoped.length > 0 ? scoped : all;
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

  // ── Session team size — the ONE source for every partner gate ──────────────
  // AI-set field first; else inferred from the workout TITLE + raw text. The title matters:
  // boards often carry the partner designation only as a heading ("Partner WOD"), which the
  // AI may drop from rawText while keeping it as the workout title. Every consumer (hero,
  // artifact sections, carousel pages, squad tag) reads this same value so the poster's
  // partner treatment can never disagree with itself. Per-block partner CONFIRMATION still
  // happens inside detectPartnerSplit against each block's own text.
  const workoutTitleText: string | undefined = isReward
    ? rewardData?.workoutSummary?.title
    : workout?.title;
  const sessionTeamSize: number | undefined =
    rewardData?.teamSize
    ?? workout?.teamSize
    ?? inferTeamSizeFromText([workoutTitleText, rawText].filter(Boolean).join('\n'));

  // The workout's actual date — never "now at render time". Reward mode carries it on
  // rewardData (set at save time); detail mode reads the persisted Firestore field.
  const workoutDate: Date = (isReward ? rewardData?.date : workout?.date) ?? new Date();
  const sourceDate = normalizeSourceDate(
    isReward ? rewardData?.sourceDate : workout?.sourceDate,
    workoutDate.getFullYear(),
  ) ?? extractSourceDateFromRawText(rawText, workoutDate.getFullYear());

  // ── Poster customization (persisted to Firestore) ──────────────────────────

  const workoutId: string | undefined = isReward ? rewardData?.workoutId : workout?.id;
  const posterSkin: PosterSkinId | undefined = workout?.posterSkin;
  const posterVibe: PosterVibeKey | undefined = workout?.posterVibe;
  const posterSticker: PosterSticker | undefined = workout?.posterSticker;
  const posterVibeOffset: PosterVibeOffset | undefined = workout?.posterVibeOffset;

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

  // Single source of truth: for reward mode, use the breakdown computed at save time (fresh,
  // built by this same code). For detail mode (viewing a saved workout), ALWAYS recompute from
  // workout.exercises via calculateWorkloadFromExercises — never trust+patch the persisted
  // workout.workloadBreakdown snapshot, which can go stale relative to the current calculation
  // logic (e.g. weightProgression) and was previously "enriched" via fragile per-exercise name
  // matching that silently no-op'd for many real shapes, leaving the row's value stale while the
  // hero (which always re-scans exercise.sets directly) stayed correct. One computation, one
  // result, for both.
  // Single source of truth PER PART: the stored workout.workloadBreakdown was built at save
  // time by calculateWorkloadBreakdown, which correctly expands each exercise's own
  // movements[]/sections[] (strength vs metcon parts are handled independently there — one
  // part's structure never leaks into another's). calculateWorkloadFromExercises is a much
  // narrower fallback: it only aggregates by exercise.name + exercise.sets and has no concept
  // of a movements[] sub-structure at all, so using it as the PRIMARY source (as a previous
  // pass here did) silently collapsed every multi-movement metcon exercise into one garbage
  // row keyed off the exercise's own name. Trust the stored breakdown when it exists; only
  // recompute from raw exercises when there's truly nothing stored to fall back to.
  const activeBreakdown = useMemo((): WorkloadBreakdown | null => {
    if (isReward) {
      const rewardBreakdown = rewardData?.workloadBreakdown;
      return rewardBreakdown && rewardData?.exercises
        ? repairUndercountedBreakdown(rewardBreakdown, rewardData.exercises)
        : rewardBreakdown ?? null;
    }
    if (workout?.workloadBreakdown) {
      const stored = workout.workloadBreakdown;
      return workout.exercises
        ? repairUndercountedBreakdown(stored, workout.exercises)
        : stored;
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
            const actual = findMovementTotal(allBreakdown, movement.name);
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
  // One exercise = one part, decided once at segmentation (the unit of a part is the SCORE).
  // No poster-layer regrouping: a session with several main parts renders one page per part.
  const posterMainExercises = useMemo((): Exercise[] => exercises.filter(isMainPart), [exercises]);

  // ── Display format — parts are standalone practices ────────────────────────
  // When the poster leads with exactly ONE main part, that part's own format (loggingMode
  // first, then its own text — see inferWorkoutFormatForExercise) IS the workout's display
  // format. The persisted session `format` describes the merge's primary part and can disagree
  // with the part the poster is actually about (e.g. a secondary skill EMOM stamping 'emom'
  // over a for_time metcon). Every DISPLAY decision (hero, poster pill, footer, vibe label)
  // reads THIS value; the session format remains authoritative only for EP/aggregate math
  // (session-scoped by design) and as the fallback inside the inference for legacy docs.
  const mainFormat: WorkoutFormat | undefined = posterMainExercises.length === 1
    ? inferWorkoutFormatForExercise(posterMainExercises[0], workoutFormat)
    : workoutFormat;

  const posterLayout: PosterLayout = (() => {
    if (posterMainExercises.length > 1) return 'multi-part';
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

    return posterMainExercises.map((ex): CarouselPage => {
      const isStrength = isStrengthPagePart(ex);
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
  }, [posterLayout, posterMainExercises, activeBreakdown?.movements]);

  // ── Hero result ───────────────────────────────────────────────────────────

  const heroResult = useMemo((): HeroResult | null => {
    const prAch = activeAchievements?.find((a) => a.type === 'pr' && a.movement && a.value);
    const prMovementName = prAch?.movement;
    const prWeight = prAch?.value;
    const teamSize = sessionTeamSize;
    const movements = activeBreakdown?.movements ?? [];
    const heroRawText = isReward ? rewardData?.workoutRawText : workout?.rawText;
    // Only reached when there's at most 1 main part — exclude any secondary exercise (e.g. a
    // warm-up) so it can never be mistaken for "the metcon" just because it comes first and
    // isn't type:'strength'.
    const mainExercises = posterMainExercises;
    // The hero speaks for the part the poster renders — summing a sibling accessory block's
    // reps into it produces a number traceable to nothing on the poster (same scoping rule
    // as artifactSections).
    const heroMovements = exercises.length > mainExercises.length && mainExercises.length > 0
      ? movementsForExercises(mainExercises, movements)
      : movements;

    return computeHeroResult(
      mainExercises.length > 0 ? mainExercises : exercises,
      mainFormat,
      totalVolume,
      totalEP,
      durationMinutes,
      isPR ?? false,
      heroMovements,
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
    posterMainExercises,
    totalVolume,
    totalEP,
    durationMinutes,
    isPR,
    activeBreakdown,
    activeAchievements,
    mainFormat,
  ]);

  // ── Vibe label & display title ────────────────────────────────────────────

  const rewardVibeLabel = useMemo(
    () =>
      getRewardVibeLabel(
        mainFormat,
        totalReps,
        durationMinutes,
        totalDistance,
        totalCalories,
        !!(ladderData && ladderData.ladderStep > 0),
      ),
    [mainFormat, totalReps, durationMinutes, totalDistance, totalCalories, ladderData],
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
        mainFormat,
        durationMinutes,
        undefined,
        stickerConfig,
      ),
    [
      activeBreakdown?.movements,
      activeAchievements,
      exercises,
      mainFormat,
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
      const mainExercises = posterMainExercises;
      // sessionTeamSize is the single partner gate shared with posterTeamSize below — the old
      // AI-field-only rule existed so this memo could never disagree with the visible gate;
      // sharing one (title-aware) value preserves that invariant while letting title-only
      // partner boards ("Partner WOD") render as partner workouts.
      const teamSize = sessionTeamSize;
      const sectionExercises = mainExercises.length > 0 ? mainExercises : exercises;
      const allMovements = activeBreakdown?.movements ?? [];
      // The breakdown spans the whole session — when sibling parts exist (e.g. a secondary
      // accessory block), scope the movements to the exercises this artifact actually renders,
      // or the sibling's movements leak into this part's prescription list.
      const scopedMovements = exercises.length > sectionExercises.length
        ? movementsForExercises(sectionExercises, allMovements)
        : allMovements;
      return buildRewardArtifactSections(
        sectionExercises,
        scopedMovements,
        rawText,
        teamSize,
        workoutTitleText,
      );
    },
    [exercises, posterMainExercises, activeBreakdown?.movements, rawText, workoutFormat, sessionTeamSize, workoutTitleText],
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

  const perPageSections = useMemo((): ArtifactSection[][] | null => {
    if (!carouselPageData) return null;
    const teamSize = sessionTeamSize;
    // rawText is shared across every page/part of the workout — only safe to pass through when
    // there's exactly one page. Otherwise each page must rely on its own exercise.rawText
    // (handled inside parseDescLadderScheme), so one part's text never matches a sibling part's.
    const scopedRawText = carouselPageData.length === 1 ? rawText : undefined;
    return carouselPageData.map((page) =>
      buildPageArtifactSections(
        page.exercise,
        page.movements,
        page.isStrength,
        scopedRawText,
        teamSize,
      ),
    );
  }, [carouselPageData, rawText, sessionTeamSize]);

  const perPageHeroResults = useMemo((): HeroResult[] | null => {
    if (!carouselPageData) return null;
    const teamSize = sessionTeamSize;

    return carouselPageData.map((page, pageIndex): HeroResult => {
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
      // teamSize is SESSION-level — only this page's own confirmed partner status may put
      // partner framing ("· In Pairs", "OUR ___") on its hero. A solo skill block sharing a
      // session with a partnered metcon stays solo.
      const pageTeamSize = perPageSections?.[pageIndex]?.[0]?.isPartnerConfirmed ? teamSize : undefined;
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
        pageTeamSize,
        `${page.exercise.name ?? ''}\n${page.exercise.prescription ?? ''}`,
      );
    });
  }, [
    carouselPageData,
    perPageSections,
    activeAchievements,
    workoutFormat,
    sessionTeamSize,
    durationMinutes,
    rawText,
  ]);

  // ── Footer stats ──────────────────────────────────────────────────────────

  const recordedCompletionSeconds =
    mainFormat === 'for_time'
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

  const posterTeamSize = sessionTeamSize ?? 0;
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
    workoutFormat: mainFormat,
    rawText,
    durationMinutes,
    displayMinutes,
    workoutDate,
    sourceDate,
    workoutId,
    posterSkin,
    posterVibe,
    posterSticker,
    posterVibeOffset,
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
