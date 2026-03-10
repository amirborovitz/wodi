import { motion } from 'framer-motion';
import styles from './ExerciseStoryCard.module.css';
import type { Exercise, MovementTotal } from '../../types';
import { detectExerciseDisplayType, getCompletedSets } from '../share/shareCardUtils';

// ============================================
// Props
// ============================================

interface ExerciseStoryCardProps {
  exercise: Exercise;
  animationDelay: number;
  animated: boolean;
  isPR?: boolean;
  /** Actual logged movement totals from WorkloadBreakdown (overrides prescription values) */
  breakdownMovements?: MovementTotal[];
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

  // For AMRAP: show per-round prescription values with total annotation
  if (isAmrap && exRounds > 1) {
    return movements.map(mov => {
      const actual = breakdownMovements?.find(
        bm => bm.name.toLowerCase() === mov.name.toLowerCase()
      );
      // Total from breakdown (actual logged)
      const totalReps = actual?.totalReps;
      const totalCals = actual?.totalCalories;
      const totalDist = actual?.totalDistance;

      // Per-round values: prefer prescription, fall back to breakdown÷rounds
      const perRoundCals = mov.calories || (totalCals && totalCals > 0 ? Math.round(totalCals / exRounds) : undefined);
      const perRoundDist = mov.distance || (totalDist && totalDist > 0 ? Math.round(totalDist / exRounds) : undefined);
      // Only use reps if no cals/distance (avoid showing "7" as reps when it's really 7 cal)
      const perRoundReps = !perRoundCals && !perRoundDist
        ? (mov.reps || (totalReps && totalReps > 0 ? Math.round(totalReps / exRounds) : undefined))
        : mov.reps;

      const parts = buildMovementLineParts(
        mov.name,
        perRoundCals ? undefined : perRoundReps, // Don't pass reps if we have calories
        perRoundDist,
        perRoundCals,
        actual?.weight ?? (mov.rxWeights?.male || mov.rxWeights?.female),
        actual?.unit || mov.rxWeights?.unit,
      );

      // Add total annotation with unit: "×6 = 42 cal"
      const total = totalCals || totalDist || totalReps;
      const perRound = perRoundCals || perRoundDist || perRoundReps;
      if (total && total > 0 && perRound && perRound > 0 && exRounds > 1) {
        const totalUnit = totalCals ? ' cal' : totalDist ? (totalDist >= 1000 ? ' km' : ' m') : '';
        parts.totalNote = `\u00d7${exRounds} = ${totalCals ? total : totalDist && totalDist >= 1000 ? (totalDist / 1000).toFixed(1) : total}${totalUnit}`;
      }
      return parts;
    });
  }

  if (breakdownMovements && breakdownMovements.length > 0) {
    const setsRounds = sets.length || 1;
    return movements.map(mov => {
      const actual = breakdownMovements.find(
        bm => bm.name.toLowerCase() === mov.name.toLowerCase()
      );
      if (actual) {
        // Use breakdown data, but fall back to prescription reps if breakdown has 0
        const reps = (actual.totalReps && actual.totalReps > 0) ? actual.totalReps : undefined;
        const fallbackReps = !reps && mov.reps ? mov.reps * setsRounds : undefined;
        return buildMovementLineParts(
          mov.name,
          reps || fallbackReps,
          actual.totalDistance ?? undefined,
          actual.totalCalories ?? undefined,
          actual.weight ?? undefined,
          actual.unit,
        );
      }
      // No breakdown match — use prescription values
      const rxW = mov.rxWeights?.male || mov.rxWeights?.female;
      return buildMovementLineParts(
        mov.name,
        mov.reps,
        mov.distance,
        mov.calories,
        rxW,
        mov.rxWeights?.unit,
      );
    });
  }

  // No breakdown — use prescription values
  return movements.map(mov => {
    const rxW = mov.rxWeights?.male || mov.rxWeights?.female;
    return buildMovementLineParts(
      mov.name,
      mov.reps,
      mov.distance,
      mov.calories,
      rxW,
      mov.rxWeights?.unit,
    );
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
    // Prefer breakdown movements (correctly accounts for rounds × reps × weight per movement)
    let totalVol = 0;
    if (breakdownMovements && breakdownMovements.length > 0) {
      totalVol = breakdownMovements.reduce((sum, m) => {
        if (m.weight && m.weight > 0 && m.totalReps && m.totalReps > 0) {
          return sum + m.weight * m.totalReps;
        }
        return sum;
      }, 0);
    } else {
      totalVol = sets.reduce((sum, s) => sum + (s.weight || 0) * (s.actualReps || s.targetReps || 0), 0);
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

export function ExerciseStoryCard({ exercise, animationDelay, animated, isPR, breakdownMovements, compact, maxMovements, onTap }: ExerciseStoryCardProps) {
  const displayType = detectExerciseDisplayType(exercise);
  const { color, label } = META[displayType] ?? META.for_time;
  const lineParts = buildBoardLineParts(exercise, breakdownMovements, displayType);
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

  // Movement limiting for compact mode
  const visibleLines = maxMovements && lineParts.length > maxMovements
    ? lineParts.slice(0, maxMovements)
    : lineParts;
  const overflowCount = maxMovements ? Math.max(0, lineParts.length - maxMovements) : 0;

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

      {/* ── Movement list: structured quantity · name · load ── */}
      {visibleLines.length > 0 && (
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
                <span className={styles.boardName}>{parts.name}</span>
                {parts.load && (
                  <>
                    <span className={styles.boardSep}> — </span>
                    <span className={styles.boardLoad}>{parts.load}</span>
                  </>
                )}
                {parts.totalNote && (
                  <span className={styles.boardTotal}> {parts.totalNote}</span>
                )}
              </span>
            </motion.div>
          ))}
          {overflowCount > 0 && (
            <span className={`${styles.boardOverflow} ${styles[`label_${color}`]}`}>
              + {overflowCount} more
            </span>
          )}
        </div>
      )}

      {/* Fallback: raw prescription when no movements parsed */}
      {lineParts.length === 0 && exercise.prescription && (
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
