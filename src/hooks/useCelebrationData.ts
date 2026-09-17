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
  PosterPhoto,
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
} from '../components/celebration/types';
import type { WorkoutWithStats } from './useWorkouts';
import { useAuth } from '../context/AuthContext';
import {
  calculateWorkoutEP,
  getTimeCapMinutes,
  DEFAULT_BW,
} from '../utils/xpCalculations';
import { asLoadUnit, exerciseLoadUnit, type LoadUnit } from '../utils/loadUnits';
import {
  calculateWorkloadFromExercises,
  assignMovementColors,
} from '../services/workloadCalculation';
import { sessionPartnerFactor } from '../services/partnerScope';
import {
  DEFAULT_CELEBRATION_STICKER_CONFIG,
  type CelebrationStickerConfig,
} from '../services/celebrationStickerConfig';
import { hasStructuralCorrection } from '../components/celebration/corrections';
import {
  movementsForParts,
} from '../components/celebration/movementResolution';
import { resolveSourceDate } from '../services/sourceDateResolution';
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
  getEngineThresholdStamp,
  BARBELL_PATTERNS,
} from '../components/celebration/helpers';
import { achievementMatchesMovementList } from '../components/celebration/faces/HandwrittenFace/posterData';
import { orderPosterParts } from '../components/celebration/mainPart';

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
  getEngineThresholdStamp,
  BARBELL_PATTERNS,
};

// ─── Types ────────────────────────────────────────────────────────────────────

/** One page of a multi-part carousel. `carouselPageData` is already in deck order (orderPosterParts). */
export interface CarouselPage {
  exercise: Exercise;
  movements: MovementTotal[];
  isStrength: boolean;
}

/**
 * The transient post-save PR moment. Non-null ONLY in reward mode — re-opening a
 * workout from history must not replay the celebration. Resolved here rather than in
 * the face so `isReward` never becomes a rendering condition downstream.
 *
 * `pageIndex` indexes `carouselPageData` — the part the PR belongs to, which is also its slide.
 */
export interface PRCelebration {
  movement: string;
  value: number;
  /** The unit the lift was logged in — a 315 lb deadlift must never flash up as "315 KG". */
  unit: LoadUnit;
  previousBest?: number;
  isFirstEver: boolean;
  extraCount: number;
  pageIndex: number | null;
}

export interface CelebrationData {
  // Raw inputs normalised from both modes
  exercises: Exercise[];
  // DISPLAY format: on a one-part session, that part's own format (loggingMode-first) — NOT
  // necessarily the persisted session `format`, which is only authoritative for EP/aggregate
  // math. A session of several parts is a carousel, and each page reads its own part's format.
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
  posterPhoto: PosterPhoto | undefined;
  /**
   * A throwaway log, excluded from every count — and from the feed, which is
   * why this reaches the poster at all. Only known in 'detail' mode: RewardData
   * doesn't carry the flag, so a test workout re-logged through the reward path
   * still offers Post to Feed.
   */
  isTest: boolean;

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
  prCelebration: PRCelebration | null;
  ladderData: { ladderReps: number[]; ladderStep: number } | null;
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


// ─── The hook ─────────────────────────────────────────────────────────────────

export function useCelebrationData(
  mode: 'reward' | 'detail',
  rewardData: RewardData | undefined,
  workout: WorkoutWithStats | undefined,
  stickerConfig: CelebrationStickerConfig = DEFAULT_CELEBRATION_STICKER_CONFIG,
  // Corrections flagged in THIS session ("AI got it wrong?"), so the poster downgrades
  // immediately — the persisted workout.corrections only lands on the next fetch.
  sessionCorrections: readonly string[] = [],
): CelebrationData {
  const { user } = useAuth();
  const isReward = mode === 'reward';

  // ── Correction fallback (poster truth standard) ────────────────────────────
  // A structural "AI got it wrong?" flag (movement / reps-load / format) means the parse's
  // structured interpretation can't be trusted. Downgrade every part that carries its own
  // board text to 'free' so the poster renders the whiteboard verbatim with only the
  // athlete's entered scores — the same path genuinely unclassifiable parts already use.
  // Parts without rawText keep structured rendering (verbatim would have nothing to show).
  // Derived shaping (complex/ladder/chipper detection, derived stat stickers) is gated off
  // below for the same reason; PR stickers stay — they carry user-entered weights.
  const verbatimMode = hasStructuralCorrection([
    ...(workout?.corrections ?? []),
    ...sessionCorrections,
  ]);

  // ── Basic normalisation ───────────────────────────────────────────────────

  const exercises = useMemo((): Exercise[] => {
    const base = isReward ? (rewardData?.exercises ?? []) : (workout?.exercises ?? []);
    if (!verbatimMode) return base;
    return base.map((ex) => (ex.rawText?.trim() ? { ...ex, loggingMode: 'free' as const } : ex));
  }, [isReward, rewardData?.exercises, workout?.exercises, verbatimMode]);

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
    // An explicit `partnerWorkout: false` on the doc is the parse's judgment that the pair
    // language in the text is NOT shared work (e.g. pair-paced AMRAPs where the pair is only
    // the clock) — trust it instead of re-inferring a team from that same text.
    ?? (workout?.partnerWorkout === false
      ? undefined
      : inferTeamSizeFromText([workoutTitleText, rawText].filter(Boolean).join('\n')));

  // The workout's actual date — never "now at render time". Reward mode carries it on
  // rewardData (set at save time); detail mode reads the persisted Firestore field.
  const workoutDate: Date = (isReward ? rewardData?.date : workout?.date) ?? new Date();
  const storedSourceDate: string | undefined = isReward ? rewardData?.sourceDate : workout?.sourceDate;
  // The stored date is the authority: either what the parser resolved at save time, or what the
  // athlete set by tapping the poster's date. rawText only BACKFILLS a missing one — letting it
  // compete would let a board date that sits closer to the logging day outvote the athlete's own
  // correction, so the poster snapped back to the old date every time it was reopened.
  const sourceDate = resolveSourceDate(storedSourceDate, undefined, workoutDate)
    ?? resolveSourceDate(undefined, rawText, workoutDate);

  // ── Poster customization (persisted to Firestore) ──────────────────────────

  const workoutId: string | undefined = isReward ? rewardData?.workoutId : workout?.id;
  const posterSkin: PosterSkinId | undefined = workout?.posterSkin;
  const posterVibe: PosterVibeKey | undefined = workout?.posterVibe;
  const posterSticker: PosterSticker | undefined = workout?.posterSticker;
  const posterVibeOffset: PosterVibeOffset | undefined = workout?.posterVibeOffset;
  const posterPhoto: PosterPhoto | undefined = workout?.posterPhoto;
  const isTest: boolean = workout?.isTest === true;

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

  // THE totals, exactly as saved. The stored workloadBreakdown is the single truth for how much
  // work a workout holds: the weekly recap, stats, EP and milestones read it raw, and so does the
  // poster. The poster used to "repair" it on the way to the screen (repairUndercountedBreakdown,
  // removed 2026-09-14) — so every save bug it papered over looked right here and lived on
  // everywhere else: 232 thrusters on a weekly recap for a board of 58. A wrong total is now
  // fixed where it is made, at save, and shows here the moment it happens.
  //
  // Recomputed only when nothing is stored at all (no saved workout lacks one today).
  const activeBreakdown = useMemo((): WorkloadBreakdown | null => {
    if (isReward) return rewardData?.workloadBreakdown ?? null;
    if (workout?.workloadBreakdown) return workout.workloadBreakdown;
    if (workout?.exercises && workout.exercises.length > 0) {
      const breakdown = calculateWorkloadFromExercises(workout.exercises, undefined, sessionPartnerFactor(workout));
      breakdown.movements = assignMovementColors(breakdown.movements);
      return breakdown;
    }
    return null;
  }, [
    isReward,
    rewardData?.workloadBreakdown,
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
    if (verbatimMode) return null;
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
  }, [verbatimMode, activeBreakdown?.movements, exercises, rawText]);

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

  if (shouldLogCelebrationDebug()) {
    // Itemised so any zero is explainable, not a mystery: EP shows which term is 0 (volume 0 =
    // nothing weighted, calories 0 = no machine work), workload shows the grand totals and the
    // per-movement rows that feed them (and whether they were estimated/guesswork).
    console.log('[CelebrationDebug] EP + workload breakdown', {
      ep: rewardEP ?? detailEP,
      workload: {
        grandTotalReps: activeBreakdown?.grandTotalReps ?? 0,
        grandTotalVolume: activeBreakdown?.grandTotalVolume ?? 0,
        grandTotalDistance: activeBreakdown?.grandTotalDistance ?? 0,
        grandTotalCalories: activeBreakdown?.grandTotalCalories ?? 0,
        estimated: activeBreakdown?.estimated ?? false,
      },
      movements: (activeBreakdown?.movements ?? []).map((m) => ({
        name: m.name, reps: m.totalReps, weight: m.weight,
        distance: m.totalDistance, calories: m.totalCalories,
      })),
    });
  }

  // ── Ladder ────────────────────────────────────────────────────────────────

  const ladderData = useMemo((): {
    ladderReps: number[];
    ladderStep: number;
  } | null => {
    if (verbatimMode) return null;
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
    return { ladderReps: reps, ladderStep: step };
  }, [verbatimMode, exercises, activeBreakdown?.movements]);

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
    !verbatimMode
    && !ladderData
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
  // several parts (e.g. strength + metcon) into one combined poster. The carousel's per-page
  // builders already handle ladder/chipper/complex shaping for whichever page needs it.
  // One exercise = one part, decided once at segmentation (the unit of a part is the SCORE).
  // No poster-layer regrouping, and no part left out: every part renders its own page, an
  // accessory block included — it is work the athlete did and logged (orderPosterParts puts it
  // at the back of the deck).

  // ── Display format — parts are standalone practices ────────────────────────
  // On a one-part session, that part's own format (loggingMode first, then its own text — see
  // inferWorkoutFormatForExercise) IS the workout's display format. Every DISPLAY decision
  // (hero, poster pill, footer, vibe label) reads THIS value; the session format remains
  // authoritative only for EP/aggregate math (session-scoped by design) and as the fallback
  // inside the inference for legacy docs.
  const mainFormat: WorkoutFormat | undefined = exercises.length === 1
    ? inferWorkoutFormatForExercise(exercises[0], workoutFormat)
    : workoutFormat;

  const posterLayout: PosterLayout = (() => {
    if (exercises.length > 1) return 'multi-part';
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

    return orderPosterParts(exercises).map((ex): CarouselPage => {
      const isStrength = isStrengthPagePart(ex);
      const fromBreakdown = movementsForParts(allMovements, [ex], [exercises.indexOf(ex)]);

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
          // Sets store a bare number — the unit is the one this part was prescribed in.
          unit: exerciseLoadUnit(ex),
          color: 'yellow',
        };
        return { exercise: ex, movements: [derived], isStrength };
      }

      // Nothing in the breakdown belongs to this part and it logged no weighted sets — the page
      // renders from its prescription alone rather than borrowing a sibling's numbers.
      return { exercise: ex, movements: [], isStrength };
    });
  }, [posterLayout, exercises, activeBreakdown?.movements]);

  // ── Hero result ───────────────────────────────────────────────────────────

  const heroResult = useMemo((): HeroResult | null => {
    const prAch = activeAchievements?.find((a) => a.type === 'pr' && a.movement && a.value);
    const prMovementName = prAch?.movement;
    const prWeight = prAch?.value;
    const teamSize = sessionTeamSize;
    const movements = activeBreakdown?.movements ?? [];
    const heroRawText = isReward ? rewardData?.workoutRawText : workout?.rawText;

    return computeHeroResult(
      exercises,
      mainFormat,
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
      exercises.map((_, index) => index),
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
      // Derived-claim stickers (workhorse totals, engine thresholds) restate the structured
      // interpretation — suppressed under a structural correction, unlike PR stickers.
      verbatimMode
        ? null
        : getFlexHighlightStamp(
            activeBreakdown?.movements ?? [],
            activeAchievements,
            exercises,
            mainFormat,
            durationMinutes,
            undefined,
            stickerConfig,
          ),
    [
      verbatimMode,
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
      // sessionTeamSize is the single partner gate shared with posterTeamSize below — the old
      // AI-field-only rule existed so this memo could never disagree with the visible gate;
      // sharing one (title-aware) value preserves that invariant while letting title-only
      // partner boards ("Partner WOD") render as partner workouts.
      return buildRewardArtifactSections(
        exercises,
        activeBreakdown?.movements ?? [],
        rawText,
        sessionTeamSize,
        workoutTitleText,
      );
    },
    [exercises, activeBreakdown?.movements, rawText, sessionTeamSize, workoutTitleText],
  );

  // ── Per-page carousel data ────────────────────────────────────────────────

  const perPageStamps = useMemo((): (HighlightStampData | null)[] | null => {
    if (!carouselPageData) return null;
    if (verbatimMode) return carouselPageData.map(() => null);
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
  }, [verbatimMode, carouselPageData, activeAchievements, workoutFormat, durationMinutes, stickerConfig]);

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

  // ── PR celebration (transient, reward mode only) ──────────────────────────
  // The landing slide is deliberately the metcon (orderPosterParts), and the
  // poster's PR badge is page-scoped, so a strength PR is otherwise unreachable in the
  // moment it happens. This drives a session-level overlay above the poster.

  const prCelebration = useMemo((): PRCelebration | null => {
    if (!isReward) return null;

    const prs = (activeAchievements ?? []).filter(
      (a) => a.type === 'pr' && a.movement && typeof a.value === 'number',
    );
    if (prs.length === 0) return null;

    // Biggest lift leads. Ties keep detection order so the hero stays stable across renders.
    const best = prs.reduce((top, a) => ((a.value ?? 0) > (top.value ?? 0) ? a : top), prs[0]);

    const pageIndex = carouselPageData?.findIndex((page) =>
      achievementMatchesMovementList(best, page.movements),
    );

    // The achievement itself carries a bare number; the breakdown row the PR was matched to
    // is what knows which unit the athlete entered.
    const prRow = pageIndex != null && pageIndex >= 0
      ? carouselPageData?.[pageIndex].movements.find((m) => (m.weight ?? 0) > 0)
      : undefined;

    return {
      movement: best.movement!,
      value: best.value!,
      unit: asLoadUnit(prRow?.unit),
      previousBest: best.previousBest,
      isFirstEver: best.previousBest == null,
      extraCount: prs.length - 1,
      pageIndex: pageIndex != null && pageIndex >= 0 ? pageIndex : null,
    };
  }, [isReward, activeAchievements, carouselPageData]);

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
    posterPhoto,
    isTest,
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
    prCelebration,
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
