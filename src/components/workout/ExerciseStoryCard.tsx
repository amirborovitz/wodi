import { motion } from 'framer-motion';
import styles from './ExerciseStoryCard.module.css';
import type { Exercise, MovementTotal, ParsedSectionType } from '../../types';
import { detectExerciseDisplayType, getCompletedSets } from '../share/shareCardUtils';

// ============================================
// Props
// ============================================

/** Partner context — when a workout is done with others */
interface PartnerContext {
  teamSize: number;       // 2 for pairs, 3 for teams of 3, etc.
  partnerFactor: number;  // 1/teamSize — personal share multiplier
}

interface ExerciseStoryCardProps {
  exercise: Exercise;
  animationDelay: number;
  animated: boolean;
  isPR?: boolean;
  /** Actual logged movement totals from WorkloadBreakdown (overrides prescription values) */
  breakdownMovements?: MovementTotal[];
  /** Partner workout context — used to annotate buy-in/cash-out personal share */
  partnerContext?: PartnerContext;
  /** Compact mode: adaptive sizing for single-screen fit */
  compact?: boolean;
  /** Max movements to show before "+ X more" overflow label */
  maxMovements?: number;
  /** Called when card is tapped (compact mode: opens detail overlay) */
  onTap?: () => void;
}

// ============================================
// Formatters
// ============================================

function fmtWeight(kg: number): string {
  return kg % 1 === 0 ? `${kg}` : `${parseFloat(kg.toFixed(1))}`;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtDist(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

/** Find a breakdown entry by movement name, also checking originalMovement for substitutions */
function findBreakdownMatch(breakdownMovements: MovementTotal[] | undefined, movName: string): MovementTotal | undefined {
  if (!breakdownMovements) return undefined;
  const lower = movName.toLowerCase();
  return breakdownMovements.find(
    bm => bm.name.toLowerCase() === lower || bm.originalMovement?.toLowerCase() === lower
  );
}

// ============================================
// Movement Line Formatter
// Produces structured parts: quantity · name · load
// Each part is returned separately so they can be styled independently.
// ============================================

interface MovementLineParts {
  quantity: string;   // "7 cal", "10", "500 m", ""
  name: string;       // "Echo Bike", "Toes to Bar"
  load: string;       // "17.5kg", "" — only when meaningful
  totalNote?: string; // "×6 = 42" — for AMRAP per-round display
  shareNote?: string; // "your part 50" — partner workout personal share
  wasSubstituted?: boolean;
  originalMovement?: string;
  substitutionType?: 'easier' | 'harder' | 'equivalent';
}

function buildMovementLineParts(
  movName: string,
  reps: number | undefined,
  distance: number | undefined,
  calories: number | undefined,
  weight: number | undefined,
  unit?: string,
): MovementLineParts {
  // Quantity: prioritise the most meaningful metric
  let quantity = '';
  if (calories && calories > 0) {
    quantity = `${calories} cal`;
  } else if (distance && distance > 0) {
    quantity = fmtDist(distance);
  } else if (reps && reps > 0) {
    quantity = `${reps}`;
  }

  // Load: only show when it adds information
  // Suppress weight for calorie-based cardio machines (bike + kg is never valid)
  let load = '';
  const isCalorieBased = calories !== undefined && calories > 0;
  const isCardio = /bike|echo|assault|air.?bike|airdyne|row(?:er|ing)?|ski.?erg|run(?:ning)?|treadmill|airrunner/i.test(movName);
  if (weight && weight > 0 && !(isCalorieBased && isCardio)) {
    const wUnit = unit === 'lb' ? 'lb' : 'kg';
    load = `${fmtWeight(weight)}${wUnit}`;
  }

  return { quantity, name: movName, load };
}

// ============================================
// Section-aware board data structures
// ============================================

interface SectionBoardGroup {
  sectionType: ParsedSectionType;
  rounds: number;           // 1 for buy_in/cash_out, N for rounds blocks
  label: string;            // "BUY-IN", "×2 ROUNDS", "CASH-OUT"
  lines: MovementLineParts[];
  /** Personal share annotation for partner workouts (buy_in / cash_out) */
  shareNote?: string;       // e.g. "your share: 50 cal" or "50 cal each"
}

/** Human-readable section header label */
function buildSectionLabel(type: ParsedSectionType, rounds: number): string {
  if (type === 'buy_in') return 'BUY-IN';
  if (type === 'cash_out') return 'CASH-OUT';
  return `\u00d7${rounds} ROUNDS`;
}

/**
 * Build a personal share note for a movement line in a partner workout.
 * Returns e.g. "your part 50 cal" or "your part 300 m".
 */
function buildLineShareNote(
  line: MovementLineParts,
  partnerContext: PartnerContext,
): string | undefined {
  const { partnerFactor, teamSize } = partnerContext;
  if (teamSize <= 1) return undefined;

  // Quantity patterns: "50 cal", "300 m", "1.2 km", "21"
  const calMatch = line.quantity.match(/^(\d+(?:\.\d+)?)\s*cal$/i);
  if (calMatch) {
    const personal = Math.round(parseFloat(calMatch[1]) * partnerFactor);
    return `your part ${personal} cal`;
  }
  const mMatch = line.quantity.match(/^(\d+(?:\.\d+)?)\s*m$/i);
  if (mMatch) {
    const personal = Math.round(parseFloat(mMatch[1]) * partnerFactor);
    return `your part ${personal} m`;
  }
  const kmMatch = line.quantity.match(/^(\d+(?:\.\d+)?)\s*km$/i);
  if (kmMatch) {
    const personalM = parseFloat(kmMatch[1]) * 1000 * partnerFactor;
    const display = personalM >= 1000 ? `${(personalM / 1000).toFixed(1)} km` : `${Math.round(personalM)} m`;
    return `your part ${display}`;
  }
  const repMatch = line.quantity.match(/^(\d+)$/);
  if (repMatch) {
    const personal = Math.round(parseInt(repMatch[1], 10) * partnerFactor);
    return `your part ${personal}`;
  }
  return undefined;
}

/**
 * Build section groups from ParsedSection[] (exercise.sections).
 * Each group has a label + the movement lines for that block.
 */
function buildSectionedBoardGroups(
  exercise: Exercise,
  breakdownMovements?: MovementTotal[],
  _displayType?: string,
  partnerContext?: PartnerContext,
): SectionBoardGroup[] | null {
  if (!exercise.sections || exercise.sections.length === 0) return null;
  if (exercise.sections.length === 1) return null; // single section = no visual grouping needed

  const groups: SectionBoardGroup[] = [];

  for (const section of exercise.sections) {
    const rounds = section.rounds ?? 1;
    // For partner workouts: use prescription values (workout totals) so share notes
    // can correctly divide to personal share. Breakdown values already have partnerFactor
    // applied and would cause double-division.
    const useRx = partnerContext && partnerContext.teamSize > 1;
    const sectionLines = section.movements.map(mov => {
      const bm = findBreakdownMatch(breakdownMovements, mov.name);
      const actual = !useRx ? bm : undefined;
      // Always look up breakdown for substitution data (even in partner mode)
      const breakdownMatch = bm;
      // Use substituted name if available
      const displayName = breakdownMatch?.wasSubstituted ? breakdownMatch.name : mov.name;
      // For rounds blocks: show per-round quantities (divide total by rounds)
      if (section.sectionType === 'rounds' && rounds > 1 && actual) {
        const perCals = actual.totalCalories && actual.totalCalories > 0
          ? Math.round(actual.totalCalories / rounds) : undefined;
        const perDist = actual.totalDistance && actual.totalDistance > 0
          ? Math.round(actual.totalDistance / rounds) : undefined;
        const perReps = !perCals && !perDist && actual.totalReps && actual.totalReps > 0
          ? Math.round(actual.totalReps / rounds) : undefined;
        const parts = buildMovementLineParts(
          displayName,
          perCals ? undefined : perReps,
          perDist,
          perCals,
          actual.weight ?? (mov.rxWeights?.male || mov.rxWeights?.female),
          actual.unit || mov.rxWeights?.unit,
        );
        if (breakdownMatch?.wasSubstituted) {
          parts.wasSubstituted = true;
          parts.originalMovement = breakdownMatch.originalMovement;
          parts.substitutionType = breakdownMatch.substitutionType;
        }
        return parts;
      }
      // Use actual totals or fall back to prescription
      if (actual) {
        const parts = buildMovementLineParts(
          displayName,
          actual.totalReps && actual.totalReps > 0 ? actual.totalReps : mov.reps,
          actual.totalDistance ?? mov.distance,
          actual.totalCalories ?? mov.calories,
          actual.weight ?? (mov.rxWeights?.male || mov.rxWeights?.female),
          actual.unit || mov.rxWeights?.unit,
        );
        if (actual.wasSubstituted) {
          parts.wasSubstituted = true;
          parts.originalMovement = actual.originalMovement;
          parts.substitutionType = actual.substitutionType;
        }
        return parts;
      }
      const rxW = mov.rxWeights?.male || mov.rxWeights?.female;
      const parts = buildMovementLineParts(mov.name, mov.reps, mov.distance, mov.calories, rxW, mov.rxWeights?.unit);
      if (breakdownMatch?.wasSubstituted) {
        parts.wasSubstituted = true;
        parts.originalMovement = breakdownMatch.originalMovement;
        parts.substitutionType = breakdownMatch.substitutionType;
      }
      return parts;
    });

    const label = buildSectionLabel(section.sectionType, rounds);
    const group: SectionBoardGroup = { sectionType: section.sectionType, rounds, label, lines: sectionLines };

    // Partner share annotation: applies to ALL sections in partner workouts
    // For "rounds" sections (IGUG): partners alternate rounds, each doing full reps per round.
    // So annotate the section header with halved rounds, NOT each movement with halved reps.
    // For buy_in/cash_out: partners split the work, so annotate each movement line.
    if (partnerContext && partnerContext.teamSize > 1) {
      if (section.sectionType === 'rounds' && rounds > 1) {
        // IGUG: each person does their share of rounds with full reps
        const personalRounds = Math.round(rounds * partnerContext.partnerFactor);
        group.shareNote = `your part ×${personalRounds}`;
      } else if (sectionLines.length === 1) {
        const mov = section.movements[0];
        group.shareNote = mov.together ? 'together' : buildLineShareNote(sectionLines[0], partnerContext);
      } else {
        section.movements.forEach((mov, li) => {
          if (li < sectionLines.length) {
            sectionLines[li].shareNote = mov.together
              ? 'together'
              : buildLineShareNote(sectionLines[li], partnerContext);
          }
        });
      }
    }

    groups.push(group);
  }

  return groups;
}

/** Extrapolate a ladder rung value beyond the prescribed array */
function getLadderRungValue(ladderReps: number[], rungIdx: number): number {
  if (rungIdx < ladderReps.length) return ladderReps[rungIdx];
  const step = ladderReps.length >= 2
    ? ladderReps[ladderReps.length - 1] - ladderReps[ladderReps.length - 2]
    : 2;
  return ladderReps[ladderReps.length - 1] + step * (rungIdx - ladderReps.length + 1);
}

/** Build structured movement lines using actual logged values from breakdown when available */
function buildBoardLineParts(
  exercise: Exercise,
  breakdownMovements?: MovementTotal[],
  displayType?: string,
): MovementLineParts[] {
  const movements = exercise.movements || [];
  if (movements.length === 0) {
    // Fall back to raw prescription text as a single unstructured line
    return exercise.prescription
      ? [{ quantity: '', name: exercise.prescription, load: '' }]
      : [];
  }

  const sets = getCompletedSets(exercise);
  const exRounds = exercise.rounds || 1;
  const isAmrap = displayType === 'amrap';
  const isIntervalLike = displayType === 'emom' || displayType === 'intervals';
  const isStrength = displayType === 'strength';
  // Use completed sets as round count for interval exercises
  const intervalRounds = isIntervalLike ? (sets.length || exRounds) : exRounds;

  // Ladder AMRAP: show progression range "4→14" for ladder movements, fixed count for non-ladder
  const ladderReps = exercise.ladderReps;
  const ladderStep = exercise.ladderStep;
  if (ladderReps && ladderReps.length > 0 && ladderStep != null && ladderStep > 0) {
    const firstRung = ladderReps[0];
    const lastRung = getLadderRungValue(ladderReps, ladderStep - 1);
    return movements.map(mov => {
      const actual = findBreakdownMatch(breakdownMovements, mov.name);
      const displayName = actual?.wasSubstituted ? actual.name : mov.name;
      const isLadderMov = mov.perRound !== false; // non-ladder movements (e.g., DU "after each round") are fixed

      let quantity: string;
      let totalNote: string | undefined;
      if (isLadderMov) {
        // Show progression range in magenta accent
        quantity = `${firstRung}\u2192${lastRung}`;
        // Total from breakdown
        const total = actual?.totalReps;
        if (total && total > 0) {
          totalNote = `= ${total} reps`;
        }
      } else {
        // Fixed movement: show per-round value × intervals
        const perRound = mov.calories || mov.reps || 0;
        const total = actual?.totalReps || actual?.totalCalories;
        quantity = mov.calories ? `${mov.calories} cal` : `${mov.reps || ''}`;
        if (total && total > 0 && perRound > 0) {
          const unit = mov.calories ? ' cal' : '';
          totalNote = `\u00d7${Math.round(total / perRound)} = ${total}${unit}`;
        }
      }

      const parts = buildMovementLineParts(
        displayName,
        undefined, // we override quantity below
        undefined,
        undefined,
        actual?.weight ?? (mov.rxWeights?.male || mov.rxWeights?.female),
        actual?.unit || mov.rxWeights?.unit,
      );
      parts.quantity = quantity;
      parts.totalNote = totalNote;
      if (actual?.wasSubstituted) {
        parts.wasSubstituted = true;
        parts.originalMovement = actual.originalMovement;
        parts.substitutionType = actual.substitutionType;
      }
      return parts;
    });
  }

  // For AMRAP/EMOM/Intervals: show per-round prescription values with total annotation
  if ((isAmrap && exRounds > 1) || (isIntervalLike && intervalRounds > 1)) {
    const effectiveRounds = isIntervalLike ? intervalRounds : exRounds;
    return movements.map(mov => {
      const actual = findBreakdownMatch(breakdownMovements, mov.name);
      // Total from breakdown (actual logged)
      const totalReps = actual?.totalReps;
      const totalCals = actual?.totalCalories;
      const totalDist = actual?.totalDistance;
      const displayName = actual?.wasSubstituted ? actual.name : mov.name;

      // Per-round values: prefer prescription, fall back to breakdown÷rounds
      const perRoundCals = mov.calories || (totalCals && totalCals > 0 ? Math.round(totalCals / effectiveRounds) : undefined);
      const perRoundDist = mov.distance || (totalDist && totalDist > 0 ? Math.round(totalDist / effectiveRounds) : undefined);
      // Only use reps if no cals/distance (avoid showing "7" as reps when it's really 7 cal)
      const perRoundReps = !perRoundCals && !perRoundDist
        ? (mov.reps || (totalReps && totalReps > 0 ? Math.round(totalReps / effectiveRounds) : undefined))
        : mov.reps;

      const parts = buildMovementLineParts(
        displayName,
        perRoundCals ? undefined : perRoundReps, // Don't pass reps if we have calories
        perRoundDist,
        perRoundCals,
        actual?.weight ?? (mov.rxWeights?.male || mov.rxWeights?.female),
        actual?.unit || mov.rxWeights?.unit,
      );

      // Add total annotation with unit: "×5 = 100"
      const total = totalCals || totalDist || totalReps;
      const perRound = perRoundCals || perRoundDist || perRoundReps;
      if (total && total > 0 && perRound && perRound > 0 && effectiveRounds > 1) {
        const totalUnit = totalCals ? ' cal' : totalDist ? (totalDist >= 1000 ? ' km' : ' m') : '';
        parts.totalNote = `\u00d7${effectiveRounds} = ${totalCals ? total : totalDist && totalDist >= 1000 ? (totalDist / 1000).toFixed(1) : total}${totalUnit}`;
      }
      // Carry substitution data
      if (actual?.wasSubstituted) {
        parts.wasSubstituted = true;
        parts.originalMovement = actual.originalMovement;
        parts.substitutionType = actual.substitutionType;
      }
      return parts;
    });
  }

  const setsRounds = sets.length || 1;

  if (breakdownMovements && breakdownMovements.length > 0) {
    return movements.map(mov => {
      const actual = findBreakdownMatch(breakdownMovements, mov.name);
      if (actual) {
        const displayName = actual.wasSubstituted ? actual.name : mov.name;
        // Use breakdown data, but fall back to prescription reps if breakdown has 0
        const reps = (actual.totalReps && actual.totalReps > 0) ? actual.totalReps : undefined;
        const fallbackReps = !reps && mov.reps ? mov.reps * setsRounds : undefined;

        // For strength: show weight as average when progression exists
        let displayWeight = actual.weight ?? undefined;
        if (isStrength && actual.weightProgression && actual.weightProgression.length > 1) {
          const avg = actual.weightProgression.reduce((s, w) => s + w, 0) / actual.weightProgression.length;
          displayWeight = Math.round(avg * 2) / 2; // round to 0.5kg
        }

        const parts = buildMovementLineParts(
          displayName,
          reps || fallbackReps,
          actual.totalDistance ?? undefined,
          actual.totalCalories ?? undefined,
          displayWeight,
          actual.unit,
        );

        // For strength exercises: show sets×reps format (e.g. "4×14")
        if (isStrength && setsRounds > 1) {
          const perSetReps = mov.reps || (reps ? Math.round(reps / setsRounds) : undefined);
          if (perSetReps && perSetReps > 0) {
            parts.quantity = `${setsRounds}×${perSetReps}`;
          }
        }

        if (actual.wasSubstituted) {
          parts.wasSubstituted = true;
          parts.originalMovement = actual.originalMovement;
          parts.substitutionType = actual.substitutionType;
        }
        return parts;
      }
      // No breakdown match — use prescription values
      const rxW = mov.rxWeights?.male || mov.rxWeights?.female;
      const parts = buildMovementLineParts(
        mov.name,
        mov.reps,
        mov.distance,
        mov.calories,
        rxW,
        mov.rxWeights?.unit,
      );
      // Strength: show sets×reps even without breakdown
      if (isStrength && setsRounds > 1 && mov.reps) {
        parts.quantity = `${setsRounds}×${mov.reps}`;
      }
      return parts;
    });
  }

  // No breakdown — use prescription values
  return movements.map(mov => {
    const rxW = mov.rxWeights?.male || mov.rxWeights?.female;
    const parts = buildMovementLineParts(
      mov.name,
      mov.reps,
      mov.distance,
      mov.calories,
      rxW,
      mov.rxWeights?.unit,
    );
    if (isStrength && setsRounds > 1 && mov.reps) {
      parts.quantity = `${setsRounds}×${mov.reps}`;
    }
    return parts;
  });
}

// ============================================
// Workout Vibe Tag
// Optional contextual label that makes a workout memorable.
// Tasteful descriptors — not cheesy, not technical.
// ============================================

function getWorkoutVibe(exercise: Exercise, displayType: string): string | null {
  const sets = getCompletedSets(exercise);
  const movements = exercise.movements || [];
  const allNames = [
    exercise.name,
    ...movements.map(m => m.name),
  ].join(' ').toLowerCase();

  // Cardio / monostructural engine work
  if (
    displayType === 'cardio' ||
    /bike|row|run|ski|swim|assault|echo|cal|calories|cardio/i.test(allNames)
  ) {
    return 'Engine work';
  }

  // Grip-intensive pulling work
  if (/deadlift|hang|pull.?up|chest.?to.?bar|muscle.?up|toes.?to.?bar|t2b|ktb|barbell row/i.test(allNames)) {
    return 'Grip test';
  }

  // Heavy lower body
  if (/squat|lunge|step.?up|leg press|thrusters?|wall ball|goblet/i.test(allNames)) {
    return 'Leg burner';
  }

  // Upper body push
  if (/bench|press|push.?up|dip|handstand|hspu|overhead/i.test(allNames)) {
    return 'Upper push';
  }

  // Heavy / strength-focused — look at total volume or peak weight
  if (displayType === 'strength') {
    const peakWeight = sets.length > 0 ? Math.max(0, ...sets.map(s => s.weight || 0)) : 0;
    if (peakWeight >= 100) return 'Heavy day';
    return null; // Let the data speak for strength cards
  }

  // EMOM — structured work
  if (displayType === 'emom') return 'Structured grind';

  // Generic high-rep metcon fallback
  const totalReps = sets.reduce((sum, s) => sum + (s.actualReps || s.targetReps || 0), 0);
  if (totalReps >= 100) return 'Big effort';

  return null;
}

// ============================================
// Hero Score Extraction
// ============================================

function extractHero(exercise: Exercise, displayType: string): {
  value: string;
  unit?: string;
  color: 'magenta' | 'yellow' | 'cyan';
} | null {
  const sets = getCompletedSets(exercise);

  if (displayType === 'for_time' || displayType === 'bodyweight' || displayType === 'intervals') {
    const totalTime = sets.reduce((sum, s) => sum + (s.time || 0), 0);
    if (totalTime > 0) return { value: fmtTime(totalTime), color: 'magenta' };
    return null;
  }

  if (displayType === 'amrap') {
    // Ladder AMRAP: show total reps as hero instead of rounds
    if (exercise.ladderReps && exercise.ladderReps.length > 0 && exercise.ladderStep != null) {
      const totalReps = sets.reduce((sum, s) => sum + (s.actualReps || 0), 0);
      if (totalReps > 0) return { value: `${totalReps}`, unit: 'reps', color: 'magenta' };
    }
    // actualReps stores total reps (rounds × repsPerRound), NOT round count.
    // Use exercise.rounds (saved from AMRAP input) for the actual round count.
    if (exercise.rounds && exercise.rounds > 0) {
      return { value: `${exercise.rounds}`, unit: 'rounds', color: 'cyan' };
    }
    // Fallback: derive rounds from actualReps / repsPerRound
    const totalActualReps = sets.reduce((sum, s) => sum + (s.actualReps || 0), 0);
    if (totalActualReps <= 0) return null;
    const movements = exercise.movements || [];
    const repsPerRound = movements.reduce((sum, m) => sum + (m.calories || m.reps || 0), 0);
    if (repsPerRound > 0) {
      const rounds = Math.round(totalActualReps / repsPerRound);
      if (rounds > 0) return { value: `${rounds}`, unit: 'rounds', color: 'cyan' };
    }
    // Last resort: show total reps
    return { value: `${totalActualReps}`, unit: 'reps', color: 'cyan' };
  }

  if (displayType === 'emom') {
    const completed = sets.filter(s => s.completed).length;
    if (completed > 0) return { value: `${completed}`, unit: 'min', color: 'cyan' };
    return null;
  }

  if (displayType === 'strength') {
    const weights = sets.map(s => s.weight || 0).filter(w => w > 0);
    if (weights.length === 0) return null;
    const unique = [...new Set(weights)];
    if (unique.length > 1) {
      // Progression: show peak weight as hero (meaningful when weights vary)
      const peak = Math.max(...weights);
      return { value: fmtWeight(peak), unit: 'kg', color: 'yellow' };
    }
    // Single weight: don't show as hero — it's already in the movement lines
    // This avoids the redundant "24 kg" hero when the line says "— 24kg"
    return null;
  }

  if (displayType === 'cardio') {
    const totalDist = sets.reduce((sum, s) => sum + (s.distance || 0), 0);
    const totalCals = sets.reduce((sum, s) => sum + (s.calories || 0), 0);
    if (totalDist > 0) return { value: fmtDist(totalDist), color: 'cyan' };
    if (totalCals > 0) return { value: `${totalCals}`, unit: 'cal', color: 'cyan' };
    return null;
  }

  if (displayType === 'skill') {
    const weights = sets.map(s => s.weight || 0).filter(w => w > 0);
    if (weights.length > 0) {
      return { value: fmtWeight(Math.max(...weights)), unit: 'kg', color: 'yellow' };
    }
    return null;
  }

  return null;
}

// ============================================
// Weight Progression Extraction
// ============================================

function extractProgression(exercise: Exercise): number[] | null {
  const sets = getCompletedSets(exercise);
  const weights = sets.map(s => s.weight || 0).filter(w => w > 0);
  if (weights.length < 2) return null;
  const unique: number[] = [];
  const seen = new Set<number>();
  for (const w of weights) {
    if (!seen.has(w)) { seen.add(w); unique.push(w); }
  }
  return unique.length > 1 ? unique : null;
}

// ============================================
// Max Set Extraction (for [8-6-4-2-max] patterns)
// Detects when the last set has notably more reps at lower weight.
// ============================================
// Footer Stats Extraction (strength only)
// Shows supporting info: Volume and Set count.
// Peak weight is now the hero so we don't repeat it here.
// ============================================

function extractFooterStats(
  exercise: Exercise,
  displayType: string,
  breakdownMovements?: MovementTotal[],
): Array<{ value: string; label: string }> {
  const sets = getCompletedSets(exercise);
  const stats: Array<{ value: string; label: string }> = [];

  if (displayType === 'strength') {
    // Per-set calculation is most accurate (handles progressive weights correctly)
    let totalVol = 0;
    const setsWithWeight = sets.filter(s => s.weight && s.weight > 0);
    if (setsWithWeight.length > 0) {
      totalVol = sets.reduce((sum, s) => sum + (s.weight || 0) * (s.actualReps || s.targetReps || 0), 0);
    } else if (breakdownMovements && breakdownMovements.length > 0) {
      // Fallback to breakdown when sets don't carry weight
      totalVol = breakdownMovements.reduce((sum, m) => {
        if (m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0) {
          // Use average weight when progression exists
          const avgWeight = m.weightProgression && m.weightProgression.length > 1
            ? m.weightProgression.reduce((s, w) => s + w, 0) / m.weightProgression.length
            : m.weight;
          return sum + avgWeight * m.totalReps;
        }
        return sum;
      }, 0);
    }

    if (totalVol > 0) {
      stats.push({
        value: totalVol >= 1000 ? `${(totalVol / 1000).toFixed(1)}t` : `${Math.round(totalVol)}kg`,
        label: 'VOLUME',
      });
    }
    if (sets.length > 1) {
      stats.push({ value: `${sets.length}`, label: 'SETS' });
    }
  }

  if (displayType === 'cardio') {
    const totalTime = sets.reduce((sum, s) => sum + (s.time || 0), 0);
    if (totalTime > 0) {
      stats.push({ value: fmtTime(totalTime), label: 'TIME' });
    }
  }

  return stats;
}

// ============================================
// Metcon Recap Stats
// Compact performance summary for conditioning cards.
// Only rendered when meaningful data exists.
// ============================================

interface MetconRecap {
  roundsCompleted?: number;
  timeCap?: string;
  timeAchieved?: string;
  totalReps?: number;
  score?: string;
}

function extractMetconRecap(exercise: Exercise, displayType: string): MetconRecap | null {
  if (
    displayType !== 'for_time' &&
    displayType !== 'amrap' &&
    displayType !== 'emom' &&
    displayType !== 'intervals' &&
    displayType !== 'bodyweight'
  ) return null;

  const sets = getCompletedSets(exercise);
  const rx = (exercise.prescription || '').toLowerCase();
  const recap: MetconRecap = {};

  // Extract time cap from prescription (e.g., "20 min AMRAP", "12 min cap")
  const capMatch = rx.match(/(\d+)\s*(?:min(?:ute)?s?)\s*(?:amrap|emom|cap|time\s*cap)/i)
    || rx.match(/(?:amrap|emom)\s*(?:in\s*)?(\d+)\s*(?:min(?:ute)?s?)/i);
  if (capMatch) recap.timeCap = `${capMatch[1]} min`;

  if (displayType === 'amrap') {
    // Use exercise.rounds (actual round count), not sum of actualReps (which is total reps)
    if (exercise.rounds && exercise.rounds > 0) {
      recap.roundsCompleted = exercise.rounds;
    } else {
      const totalActualReps = sets.reduce((sum, s) => sum + (s.actualReps || 0), 0);
      if (totalActualReps > 0) {
        const movements = exercise.movements || [];
        const repsPerRound = movements.reduce((sum, m) => sum + (m.calories || m.reps || 0), 0);
        if (repsPerRound > 0) {
          recap.roundsCompleted = Math.round(totalActualReps / repsPerRound);
        }
      }
    }
  }

  if (displayType === 'emom') {
    const completed = sets.filter(s => s.completed).length;
    if (completed > 0) recap.timeCap = `${completed} min`;
  }

  if (displayType === 'for_time' || displayType === 'intervals' || displayType === 'bodyweight') {
    const totalTime = sets.reduce((sum, s) => sum + (s.time || 0), 0);
    if (totalTime > 0) recap.timeAchieved = fmtTime(totalTime);
  }

  // Extract rounds from prescription for For Time (e.g., "3 rounds for time")
  if (displayType === 'for_time') {
    const roundsMatch = rx.match(/(\d+)\s*(?:rounds?|rft)/i);
    if (roundsMatch) {
      const rounds = parseInt(roundsMatch[1], 10);
      if (rounds > 1) recap.roundsCompleted = rounds;
    }
  }

  if (Object.keys(recap).length === 0) return null;
  return recap;
}

// ============================================
// Color + Label mapping
// ============================================

type CardColor = 'yellow' | 'magenta' | 'cyan';

interface CardMeta {
  color: CardColor;
  label: string;
}

const META: Record<string, CardMeta> = {
  strength:   { color: 'yellow',  label: 'STRENGTH'  },
  for_time:   { color: 'magenta', label: 'FOR TIME'  },
  amrap:      { color: 'cyan',    label: 'AMRAP'     },
  emom:       { color: 'cyan',    label: 'EMOM'      },
  intervals:  { color: 'magenta', label: 'INTERVALS' },
  cardio:     { color: 'cyan',    label: 'CARDIO'    },
  bodyweight: { color: 'magenta', label: 'WOD'       },
  skill:      { color: 'cyan',    label: 'SKILL'     },
};

// ============================================
// Main Component
// ============================================

export function ExerciseStoryCard({ exercise, animationDelay, animated, isPR, breakdownMovements, partnerContext, compact, maxMovements, onTap }: ExerciseStoryCardProps) {
  const displayType = detectExerciseDisplayType(exercise);
  const meta = META[displayType] ?? META.for_time;
  // Ladder AMRAP: use magenta accent to signal "movement" progression
  const isLadder = exercise.ladderReps && exercise.ladderReps.length > 0 && exercise.ladderStep != null;
  const color = isLadder ? 'magenta' as CardColor : meta.color;
  const label = isLadder ? 'LADDER AMRAP' : meta.label;

  // Try to build section groups first; fall back to flat line list
  const sectionGroups = buildSectionedBoardGroups(exercise, breakdownMovements, displayType, partnerContext);
  const lineParts = sectionGroups
    ? [] // section groups replace the flat list — handled separately in JSX
    : buildBoardLineParts(exercise, breakdownMovements, displayType);

  const hero = extractHero(exercise, displayType);
  const progression = extractProgression(exercise);
  const footer = extractFooterStats(exercise, displayType, breakdownMovements);
  const metconRecap = extractMetconRecap(exercise, displayType);
  const vibe = getWorkoutVibe(exercise, displayType);

  const d = animationDelay;
  const anim = (delay: number) => animated
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: d + delay } }
    : {};

  // Show progression bars only when weights actually vary (true progression)
  const hasVaryingWeights = progression !== null && progression.length >= 2;

  // Movement limiting for compact mode (flat list only; sections are always shown in full)
  const visibleLines = maxMovements && lineParts.length > maxMovements
    ? lineParts.slice(0, maxMovements)
    : lineParts;
  const overflowCount = maxMovements ? Math.max(0, lineParts.length - maxMovements) : 0;

  // Total movement count across all sections (for overflow calculation in section mode)
  const totalSectionLines = sectionGroups
    ? sectionGroups.reduce((sum, g) => sum + g.lines.length, 0)
    : 0;

  // In compact mode, hide progression bars & set bars to save vertical space
  const showProgression = hasVaryingWeights && !compact;
  const showSetBars = hasVaryingWeights && !compact;

  const cardClasses = [
    styles.card,
    styles[`card_${color}`],
    compact ? styles.cardCompact : '',
    onTap ? styles.cardTappable : '',
  ].filter(Boolean).join(' ');

  return (
    <motion.div
      className={cardClasses}
      initial={animated ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={animated
        ? { delay: d, duration: 0.4, ease: [0.16, 1, 0.3, 1] }
        : { delay: d, duration: 0.3 }
      }
      onClick={onTap}
    >
      {/* ── Header: type label + vibe tag + PR badge ── */}
      <div className={styles.header}>
        <span className={`${styles.typeLabel} ${styles[`label_${color}`]}`}>{label}</span>
        <div className={styles.headerRight}>
          {vibe && <span className={styles.vibeTag}>{vibe}</span>}
          {isPR && <span className={styles.prBadge}>PR</span>}
        </div>
      </div>

      {/* ── Exercise name ── */}
      <h3 className={`${styles.name} ${compact ? styles.nameCompact : ''}`}>{exercise.name}</h3>

      {/* ── Hero score: dominant single metric ── */}
      {hero && (
        <motion.div className={`${styles.hero} ${compact ? styles.heroCompact : ''}`} {...anim(0.08)}>
          <span className={`${styles.heroValue} ${compact ? styles.heroValueCompact : ''} ${styles[`hero_${hero.color}`]}`}>
            {hero.value}
          </span>
          {hero.unit && <span className={styles.heroUnit}>{hero.unit}</span>}
        </motion.div>
      )}

      {/* ── Weight progression arrows (strength with varying loads) ── */}
      {showProgression && (
        <motion.div className={styles.progression} {...anim(0.10)}>
          {progression!.length <= 4 ? (
            progression!.map((w, i) => (
              <span key={i}>
                {i > 0 && <span className={styles.arrow}> ➤ </span>}
                <span className={styles.progWeight}>{fmtWeight(w)}</span>
              </span>
            ))
          ) : (
            <>
              <span className={styles.progWeight}>{fmtWeight(progression![0])}</span>
              <span className={styles.arrow}> ➤ … ➤ </span>
              <span className={styles.progWeight}>{fmtWeight(progression![progression!.length - 1])}</span>
            </>
          )}
          <span className={styles.progUnit}>kg</span>
        </motion.div>
      )}

      {/* ── Set bars visual (strength progression) ── */}
      {showSetBars && (
        <div className={styles.setBars}>
          {getCompletedSets(exercise)
            .filter(s => s.weight && s.weight > 0)
            .map((set, i, arr) => {
              const peak = Math.max(...arr.map(s => s.weight || 0));
              const pct = peak > 0 ? ((set.weight || 0) / peak) * 100 : 0;
              const isPeak = set.weight === peak;
              return (
                <motion.div
                  key={set.id || i}
                  className={`${styles.bar} ${isPeak ? styles.barPeak : ''}`}
                  style={{ height: `${Math.max(pct, 12)}%` }}
                  initial={animated ? { scaleY: 0 } : false}
                  animate={{ scaleY: 1 }}
                  transition={animated ? { delay: d + 0.15 + i * 0.03, duration: 0.35, ease: [0.16, 1, 0.3, 1] } : undefined}
                />
              );
            })}
        </div>
      )}

      {/* ── Metcon recap row (above movement list for conditioning) ── */}
      {/* Skip if hero already shows the same info (avoids duplicate "6 rounds") */}
      {metconRecap && !(hero && metconRecap.roundsCompleted !== undefined && !metconRecap.timeAchieved) && (
        <motion.div className={styles.metconRecap} {...anim(0.06)}>
          {/* Don't repeat rounds if hero already displays them */}
          {metconRecap.roundsCompleted !== undefined && !hero && (
            <span className={styles.recapChip}>
              <span className={`${styles.recapValue} ${styles[`hero_${color}`]}`}>
                {metconRecap.roundsCompleted}
              </span>
              <span className={styles.recapUnit}>rounds</span>
            </span>
          )}
          {metconRecap.timeAchieved && (
            <span className={styles.recapChip}>
              <span className={`${styles.recapValue} ${styles.hero_magenta}`}>
                {metconRecap.timeAchieved}
              </span>
              <span className={styles.recapUnit}>time</span>
            </span>
          )}
          {metconRecap.timeCap && !metconRecap.timeAchieved && (
            <span className={styles.recapChip}>
              <span className={`${styles.recapValue} ${styles[`hero_${color}`]}`}>
                {metconRecap.timeCap}
              </span>
              <span className={styles.recapUnit}>cap</span>
            </span>
          )}
          {metconRecap.totalReps !== undefined && (
            <span className={styles.recapChip}>
              <span className={`${styles.recapValue} ${styles[`hero_${color}`]}`}>
                {metconRecap.totalReps}
              </span>
              <span className={styles.recapUnit}>reps</span>
            </span>
          )}
        </motion.div>
      )}

      {/* ── Movement list: sectioned or flat ── */}
      {sectionGroups ? (
        /* ── Sectioned board: group movements under section headers ── */
        <div className={`${styles.board} ${compact ? styles.boardCompact : ''}`}>
          {sectionGroups.map((group, gi) => (
            <div key={gi} className={styles.sectionGroup}>
              {/* Section header: "BUY-IN", "×2 ROUNDS", "CASH-OUT" */}
              <div className={styles.sectionHeader}>
                <span className={`${styles.sectionHeaderLabel} ${
                  group.sectionType === 'buy_in' ? styles.sectionHeaderBuyIn :
                  group.sectionType === 'cash_out' ? styles.sectionHeaderCashOut :
                  styles.sectionHeaderRounds
                }`}>
                  {group.label}
                </span>
                <span className={styles.sectionHeaderLine} aria-hidden="true" />
                {group.shareNote && (
                  <span className={styles.sectionShareNote}>{group.shareNote}</span>
                )}
              </div>

              {/* Movements within this section */}
              {group.lines.map((parts, li) => {
                const lineIndex = gi * 100 + li; // stable animation index
                return (
                  <motion.div
                    key={li}
                    className={`${styles.boardLine} ${styles.boardLineIndented}`}
                    initial={animated ? { opacity: 0, x: -6 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    transition={animated ? { delay: d + 0.14 + lineIndex * 0.03 } : undefined}
                  >
                    <span className={`${styles.boardDot} ${styles[`dot_${color}`]}`} />
                    <span className={styles.boardContent}>
                      {parts.quantity && (
                        <span className={`${styles.boardQuantity} ${styles[`qty_${color}`]}`}>
                          {parts.quantity}
                        </span>
                      )}
                      {parts.quantity && (
                        <span className={styles.boardSep}> · </span>
                      )}
                      {parts.wasSubstituted && <span className={styles.boardSubIcon} aria-label="Substituted">⇄</span>}
                      <span className={styles.boardName}>{parts.name}</span>
                      {parts.load && (
                        <>
                          <span className={styles.boardSep}> — </span>
                          <span className={styles.boardLoad}>{parts.load}</span>
                        </>
                      )}
                      {parts.wasSubstituted && parts.quantity && (
                        <span className={styles.boardVolumeBadge}>{parts.quantity} Total</span>
                      )}
                      {parts.shareNote && (
                        <span className={styles.boardShareNote}> ({parts.shareNote})</span>
                      )}
                      {parts.totalNote && (
                        <span className={styles.boardTotal}> {parts.totalNote}</span>
                      )}
                    </span>
                    {parts.wasSubstituted && parts.originalMovement && (
                      <span className={styles.boardSubLabel}>Substituted for {parts.originalMovement}</span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ))}
          {maxMovements && totalSectionLines > maxMovements && (
            <span className={`${styles.boardOverflow} ${styles[`label_${color}`]}`}>
              + {totalSectionLines - maxMovements} more
            </span>
          )}
        </div>
      ) : visibleLines.length > 0 ? (
        /* ── Flat board: classic single-level movement list ── */
        <div className={`${styles.board} ${compact ? styles.boardCompact : ''}`}>
          {visibleLines.map((parts, i) => (
            <motion.div
              key={i}
              className={styles.boardLine}
              initial={animated ? { opacity: 0, x: -6 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={animated ? { delay: d + 0.14 + i * 0.04 } : undefined}
            >
              <span className={`${styles.boardDot} ${styles[`dot_${color}`]}`} />
              <span className={styles.boardContent}>
                {parts.quantity && (
                  <span className={`${styles.boardQuantity} ${styles[`qty_${color}`]}`}>
                    {parts.quantity}
                  </span>
                )}
                {parts.quantity && (
                  <span className={styles.boardSep}> · </span>
                )}
                {parts.wasSubstituted && <span className={styles.boardSubIcon} aria-label="Substituted">⇄</span>}
                <span className={styles.boardName}>{parts.name}</span>
                {parts.load && (
                  <>
                    <span className={styles.boardSep}> — </span>
                    <span className={styles.boardLoad}>{parts.load}</span>
                  </>
                )}
                {parts.wasSubstituted && parts.quantity && (
                  <span className={styles.boardVolumeBadge}>{parts.quantity} Total</span>
                )}
                {parts.totalNote && (
                  <span className={styles.boardTotal}> {parts.totalNote}</span>
                )}
              </span>
              {parts.wasSubstituted && parts.originalMovement && (
                <span className={styles.boardSubLabel}>Substituted for {parts.originalMovement}</span>
              )}
            </motion.div>
          ))}
          {overflowCount > 0 && (
            <span className={`${styles.boardOverflow} ${styles[`label_${color}`]}`}>
              + {overflowCount} more
            </span>
          )}
        </div>
      ) : null}

      {/* Fallback: raw prescription when no movements parsed */}
      {!sectionGroups && lineParts.length === 0 && exercise.prescription && (
        <p className={styles.rawPrescription}>{exercise.prescription}</p>
      )}

      {/* ── Footer stats (strength: vol / sets; cardio: time) — hidden in compact mode ── */}
      {footer.length > 0 && !compact && (
        <div className={styles.footer}>
          {footer.map((stat, i) => (
            <span key={i} className={styles.footerChip}>
              <span className={`${styles.footerValue} ${styles[`footerAccent_${color}`]}`}>{stat.value}</span>
              <span className={styles.footerLabel}>{stat.label}</span>
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
