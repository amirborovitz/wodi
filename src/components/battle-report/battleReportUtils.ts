import type {
  RewardData,
  ParsedWorkout,
  ParsedExercise,
  Exercise,
  MovementTotal,
} from '../../types';
import type {
  BadgeInfo,
  BadgeType,
  ChapterData,
  HeadlineData,
  HeroMetric,
  TeamImpactData,
} from './types';

// ─── Color helpers ───────────────────────────────────────────

function trinityColor(color?: 'cyan' | 'magenta' | 'yellow'): string {
  switch (color) {
    case 'cyan': return 'var(--neon-cyan)';
    case 'magenta': return 'var(--neon-magenta)';
    case 'yellow': return 'var(--neon-yellow)';
    default: return 'var(--neon-cyan)';
  }
}

function formatAccentColor(format?: string): string {
  switch (format) {
    case 'strength': return 'var(--neon-yellow)';
    case 'for_time':
    case 'amrap':
    case 'amrap_intervals': return 'var(--neon-magenta)';
    case 'emom':
    case 'intervals':
    case 'tabata': return 'var(--neon-cyan)';
    default: return 'var(--neon-cyan)';
  }
}

// ─── Time formatting ─────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Badge detection ─────────────────────────────────────────

const BADGE_DEFS: Record<BadgeType, { label: string; icon: string }> = {
  sprint_king:    { label: 'Sprint King',    icon: '\u26A1' },
  unyielding:     { label: 'Unyielding',     icon: '\uD83D\uDEE1\uFE0F' },
  iron_grip:      { label: 'Iron Grip',      icon: '\uD83D\uDCAA' },
  volume_monster: { label: 'Volume Monster', icon: '\uD83D\uDD25' },
  endurance:      { label: 'Endurance',      icon: '\u23F1\uFE0F' },
  full_send:      { label: 'Full Send',      icon: '\uD83D\uDE80' },
  precision:      { label: 'Precision',      icon: '\uD83C\uDFAF' },
  clean_sweep:    { label: 'Clean Sweep',    icon: '\u2728' },
};

function makeBadge(type: BadgeType, color: string): BadgeInfo {
  const def = BADGE_DEFS[type];
  return { type, label: def.label, icon: def.icon, color };
}

function detectExerciseBadges(
  exercise: Exercise,
  parsedExercise: ParsedExercise | undefined,
  _parsedWorkout: ParsedWorkout,
  allExercises: Exercise[],
  movementTotals: MovementTotal[],
): BadgeInfo[] {
  const badges: BadgeInfo[] = [];
  const sets = exercise.sets.filter(s => s.completed);
  if (sets.length === 0) return badges;

  // Sprint King: exercise has a completion time and it's the fastest
  const time = sets[0]?.time;
  if (time && time > 0) {
    const allTimes = allExercises
      .flatMap(ex => ex.sets.filter(s => s.completed && s.time && s.time > 0))
      .map(s => s.time!);
    if (allTimes.length > 1 && time === Math.min(...allTimes)) {
      badges.push(makeBadge('sprint_king', 'var(--neon-cyan)'));
    }
  }

  // Iron Grip: heaviest weight in the session
  const maxWeight = Math.max(...sets.map(s => s.weight ?? 0));
  if (maxWeight > 0) {
    const allMaxWeights = allExercises.map(ex =>
      Math.max(...ex.sets.filter(s => s.completed).map(s => s.weight ?? 0))
    );
    if (maxWeight === Math.max(...allMaxWeights) && allMaxWeights.filter(w => w > 0).length > 1) {
      badges.push(makeBadge('iron_grip', 'var(--neon-yellow)'));
    }
  }

  // Volume Monster: highest total volume for this exercise
  const totalVol = movementTotals.reduce((sum, m) => sum + (m.weight ?? 0) * (m.totalReps ?? 0), 0);
  if (totalVol > 0) {
    const allVols = allExercises.map((_, idx) => {
      const mts = getMovementTotalsForExercise(idx, allExercises, _parsedWorkout);
      return mts.reduce((sum, m) => sum + (m.weight ?? 0) * (m.totalReps ?? 0), 0);
    });
    if (totalVol === Math.max(...allVols) && allVols.filter(v => v > 0).length > 1) {
      badges.push(makeBadge('volume_monster', 'var(--neon-magenta)'));
    }
  }

  // Unyielding: completed all prescribed rounds (for multi-round exercises)
  // For scored exercises (AMRAP/For Time), rounds are stored on exercise.rounds,
  // not as individual sets. Compare logged rounds against the parsed prescription.
  if (exercise.rounds && exercise.rounds > 0) {
    const prescribed = parsedExercise?.suggestedSets ?? 0;
    // For strength: sets.length tracks actual sets done
    // For scored: exercise.rounds is the logged round count
    const completed = sets.length > 1 ? sets.length : exercise.rounds;
    if (prescribed > 0 && completed >= prescribed) {
      badges.push(makeBadge('unyielding', 'var(--neon-cyan)'));
    }
  }

  // Precision: hit exact prescribed reps on all sets
  const allPrecise = sets.every(s =>
    s.targetReps != null && s.actualReps != null && s.actualReps === s.targetReps
  );
  if (allPrecise && sets.length > 0 && sets[0].targetReps != null) {
    badges.push(makeBadge('precision', 'var(--neon-yellow)'));
  }

  return badges.slice(0, 2); // max 2 badges per chapter
}

// ─── Movement totals per exercise ────────────────────────────

function getMovementTotalsForExercise(
  exerciseIndex: number,
  exercises: Exercise[],
  parsedWorkout: ParsedWorkout,
): MovementTotal[] {
  const exercise = exercises[exerciseIndex];
  const parsed = parsedWorkout.exercises[exerciseIndex];
  if (!exercise || !parsed) return [];

  // Match movements by name from parsed exercise
  // We don't have per-exercise breakdown from workloadBreakdown (it's flat),
  // so build approximate totals from the exercise sets
  const totals: MovementTotal[] = [];
  const sets = exercise.sets.filter(s => s.completed);

  if (parsed.movements && parsed.movements.length > 0) {
    // Multi-movement exercise: create a total for each movement
    for (const mov of parsed.movements) {
      const totalReps = mov.reps ? mov.reps * (parsedWorkout.containerRounds ?? 1) : undefined;
      totals.push({
        name: mov.name,
        totalReps,
        weight: mov.rxWeights?.male ?? sets[0]?.weight,
        color: mov.isBodyweight ? 'magenta' : (mov.rxWeights ? 'yellow' : 'cyan'),
      });
    }
  } else {
    // Single movement
    const totalReps = sets.reduce((sum, s) => sum + (s.actualReps ?? 0), 0);
    const weight = sets[0]?.weight;
    totals.push({
      name: exercise.name,
      totalReps: totalReps || undefined,
      weight,
      color: weight ? 'yellow' : 'magenta',
    });
  }

  return totals;
}

// ─── Hero metric per exercise ────────────────────────────────

function computeHeroMetric(exercise: Exercise, parsed: ParsedWorkout): HeroMetric {
  const sets = exercise.sets.filter(s => s.completed);
  if (sets.length === 0) return { value: '--', label: 'not logged' };

  // Completion time (for_time)
  const time = sets[0]?.time;
  if (time && time > 0 && (parsed.format === 'for_time' || parsed.format === 'intervals')) {
    return { value: formatTime(time), label: exercise.prescription };
  }

  // Rounds (AMRAP)
  if (exercise.rounds != null && exercise.rounds > 0) {
    const partialReps = sets[0]?.actualReps;
    return {
      value: `${exercise.rounds}`,
      unit: 'rounds',
      label: partialReps ? `+ ${partialReps} reps` : exercise.prescription,
    };
  }

  // Weight (strength)
  const maxW = Math.max(...sets.map(s => s.weight ?? 0));
  if (maxW > 0) {
    return {
      value: `${maxW}`,
      unit: 'kg',
      label: `${sets.length} sets \u00D7 ${sets[0]?.actualReps ?? sets[0]?.targetReps ?? '?'} reps`,
    };
  }

  // Reps only
  const totalReps = sets.reduce((sum, s) => sum + (s.actualReps ?? 0), 0);
  if (totalReps > 0) {
    return { value: `${totalReps}`, unit: 'reps', label: exercise.prescription };
  }

  // Distance
  const dist = sets[0]?.distance;
  if (dist && dist > 0) {
    return { value: dist >= 1000 ? `${(dist / 1000).toFixed(1)}` : `${dist}`, unit: dist >= 1000 ? 'km' : 'm' };
  }

  return { value: '\u2713', label: 'completed' };
}

// ─── Public API ──────────────────────────────────────────────

export function computeChapters(
  rewardData: RewardData,
  parsedWorkout: ParsedWorkout,
): ChapterData[] {
  const { exercises, workloadBreakdown } = rewardData;

  return exercises.map((exercise, i) => {
    const parsed = parsedWorkout.exercises[i];
    const movementTotals = workloadBreakdown
      ? getMovementTotalsForExercise(i, exercises, parsedWorkout)
      : [];

    // Determine accent color from workload breakdown or format
    const primaryMovement = movementTotals[0];
    const accentColor = primaryMovement?.color
      ? trinityColor(primaryMovement.color)
      : formatAccentColor(parsedWorkout.format);

    return {
      exerciseIndex: i,
      exercise,
      parsedExercise: parsed,
      accentColor,
      heroMetric: computeHeroMetric(exercise, parsedWorkout),
      badges: detectExerciseBadges(exercise, parsed, parsedWorkout, exercises, movementTotals),
      movementTotals,
    };
  });
}

export function computeHeadline(
  rewardData: RewardData,
  parsedWorkout: ParsedWorkout,
): HeadlineData {
  const { workoutSummary, exercises } = rewardData;
  const format = parsedWorkout.format;
  const accentColor = formatAccentColor(format);

  const formatLabels: Record<string, string> = {
    for_time: 'FOR TIME',
    amrap: 'AMRAP',
    amrap_intervals: 'AMRAP',
    emom: 'EMOM',
    intervals: 'INTERVALS',
    strength: 'STRENGTH',
    tabata: 'TABATA',
  };

  const formatLabel = formatLabels[format] ?? format.replace(/_/g, ' ').toUpperCase();

  // For Time: show completion time
  if (format === 'for_time' || format === 'intervals') {
    const firstTime = exercises
      .flatMap(ex => ex.sets)
      .find(s => s.completed && s.time && s.time > 0)?.time;
    if (firstTime) {
      return { primary: formatTime(firstTime), formatLabel, accentColor };
    }
  }

  // AMRAP: show rounds + partial reps
  if (format === 'amrap' || format === 'amrap_intervals') {
    const rounds = exercises[0]?.rounds;
    const partialReps = exercises[0]?.sets[0]?.actualReps;
    if (rounds != null) {
      const partialPill = partialReps ? `+ ${partialReps} reps` : undefined;
      return {
        primary: `${rounds} Rounds`,
        partialPill,
        formatLabel,
        accentColor,
      };
    }
  }

  // Strength: show peak weight
  if (format === 'strength') {
    const allWeights = exercises.flatMap(ex =>
      ex.sets.filter(s => s.completed).map(s => s.weight ?? 0)
    );
    const peak = Math.max(...allWeights, 0);
    if (peak > 0) {
      return { primary: `${peak} kg`, formatLabel, accentColor };
    }
  }

  // Fallback: total volume or reps
  if (workoutSummary.totalVolume > 0) {
    const vol = workoutSummary.totalVolume;
    return {
      primary: vol >= 1000 ? `${(vol / 1000).toFixed(1)}t` : `${Math.round(vol)} kg`,
      formatLabel,
      accentColor,
    };
  }

  return {
    primary: `${workoutSummary.totalReps} reps`,
    formatLabel,
    accentColor,
  };
}

export function computeTeamImpact(
  rewardData: RewardData,
  parsedWorkout: ParsedWorkout,
): TeamImpactData | null {
  if (!parsedWorkout.partnerWorkout || !parsedWorkout.teamSize) return null;

  const teamSize = parsedWorkout.teamSize;
  const personalVolume = rewardData.workoutSummary.totalVolume;
  const personalReps = rewardData.workoutSummary.totalReps;

  return {
    teamSize,
    personalPercent: Math.round((1 / teamSize) * 100),
    personalVolume,
    teamTotal: Math.round(personalVolume * teamSize),
    personalReps,
    teamTotalReps: Math.round(personalReps * teamSize),
  };
}
