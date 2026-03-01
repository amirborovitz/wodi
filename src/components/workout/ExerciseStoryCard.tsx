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
}

// ============================================
// Formatters
// ============================================

function fmtWeight(kg: number): string {
  return kg % 1 === 0 ? `${kg}` : `${kg.toFixed(1)}`;
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
// Data Extraction
// ============================================

/** Build the "board text" using actual logged values from breakdown when available */
function buildBoardLines(exercise: Exercise, breakdownMovements?: MovementTotal[]): string[] {
  const movements = exercise.movements || [];
  if (movements.length === 0) {
    return exercise.prescription ? [exercise.prescription] : [];
  }

  // If we have breakdown data, use actual logged totals (reps, cals, distance, weight)
  if (breakdownMovements && breakdownMovements.length > 0) {
    return movements.map(mov => {
      // Find matching breakdown entry (case-insensitive name match)
      const actual = breakdownMovements.find(
        bm => bm.name.toLowerCase() === mov.name.toLowerCase()
      );

      const parts: string[] = [];
      if (actual) {
        if (actual.totalReps && actual.totalReps > 0) parts.push(`${actual.totalReps}`);
        if (actual.totalDistance && actual.totalDistance > 0) parts.push(fmtDist(actual.totalDistance));
        if (actual.totalCalories && actual.totalCalories > 0) parts.push(`${actual.totalCalories} cal`);
        parts.push(mov.name);
        if (actual.weight && actual.weight > 0) {
          const unit = actual.unit === 'lb' ? 'lb' : 'kg';
          parts.push(`@ ${fmtWeight(actual.weight)}${unit}`);
        }
      } else {
        // Fallback to prescription values if no breakdown match
        if (mov.reps) parts.push(`${mov.reps}`);
        if (mov.distance) parts.push(fmtDist(mov.distance));
        if (mov.calories) parts.push(`${mov.calories} cal`);
        parts.push(mov.name);
        const rxW = mov.rxWeights?.male || mov.rxWeights?.female;
        if (rxW) {
          const unit = mov.rxWeights?.unit || 'kg';
          parts.push(`@ ${fmtWeight(rxW)}${unit}`);
        }
      }
      return parts.join(' ');
    });
  }

  // No breakdown — use prescription values
  return movements.map(mov => {
    const parts: string[] = [];
    if (mov.reps) parts.push(`${mov.reps}`);
    if (mov.distance) parts.push(fmtDist(mov.distance));
    if (mov.calories) parts.push(`${mov.calories} cal`);
    parts.push(mov.name);
    const rxW = mov.rxWeights?.male || mov.rxWeights?.female;
    if (rxW) {
      const unit = mov.rxWeights?.unit || 'kg';
      parts.push(`@ ${fmtWeight(rxW)}${unit}`);
    }
    return parts.join(' ');
  });
}

/** Extract hero score: { value, unit, color } */
function extractHero(exercise: Exercise, displayType: string): {
  value: string;
  unit?: string;
  color: 'magenta' | 'yellow' | 'cyan';
} | null {
  const sets = getCompletedSets(exercise);

  if (displayType === 'for_time' || displayType === 'bodyweight') {
    const totalTime = sets.reduce((sum, s) => sum + (s.time || 0), 0);
    if (totalTime > 0) return { value: fmtTime(totalTime), color: 'magenta' };
    return null;
  }

  if (displayType === 'amrap') {
    const totalRounds = sets.reduce((sum, s) => sum + (s.actualReps || 0), 0);
    if (totalRounds > 0) return { value: `${totalRounds}`, unit: 'rounds', color: 'cyan' };
    return null;
  }

  if (displayType === 'strength') {
    // Weight progression or peak weight
    const weights = sets.map(s => s.weight || 0).filter(w => w > 0);
    if (weights.length === 0) return null;
    const unique = [...new Set(weights)];
    if (unique.length > 1) {
      // Progression — this is rendered separately, no hero needed
      return null;
    }
    // Single weight — show as hero
    return { value: fmtWeight(unique[0]), unit: 'kg', color: 'yellow' };
  }

  if (displayType === 'cardio') {
    const totalDist = sets.reduce((sum, s) => sum + (s.distance || 0), 0);
    const totalCals = sets.reduce((sum, s) => sum + (s.calories || 0), 0);
    if (totalDist > 0) return { value: fmtDist(totalDist), color: 'cyan' };
    if (totalCals > 0) return { value: `${totalCals}`, unit: 'cal', color: 'cyan' };
    return null;
  }

  return null;
}

/** Extract weight progression for strength exercises */
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

/** Get secondary stats for footer */
function extractFooterStats(exercise: Exercise, displayType: string): Array<{ value: string; label: string }> {
  const sets = getCompletedSets(exercise);
  const stats: Array<{ value: string; label: string }> = [];

  const totalVol = sets.reduce((sum, s) => sum + (s.weight || 0) * (s.actualReps || s.targetReps || 0), 0);
  const peakWeight = Math.max(0, ...sets.map(s => s.weight || 0));
  const totalTime = sets.reduce((sum, s) => sum + (s.time || 0), 0);

  if (displayType === 'strength') {
    if (peakWeight > 0) {
      stats.push({ value: `${fmtWeight(peakWeight)}kg`, label: 'PEAK' });
    }
    if (totalVol > 0) {
      stats.push({
        value: totalVol >= 1000 ? `${(totalVol / 1000).toFixed(1)}t` : `${Math.round(totalVol)}kg`,
        label: 'VOL',
      });
    }
    if (sets.length > 1) {
      stats.push({ value: `${sets.length}`, label: 'SETS' });
    }
  }

  if (displayType === 'cardio' && totalTime > 0) {
    stats.push({ value: fmtTime(totalTime), label: 'TIME' });
  }

  return stats;
}

// ============================================
// Color + Label mapping
// ============================================

const META: Record<string, { color: string; label: string }> = {
  strength: { color: 'yellow', label: 'STRENGTH' },
  for_time: { color: 'magenta', label: 'FOR TIME' },
  amrap: { color: 'magenta', label: 'AMRAP' },
  cardio: { color: 'cyan', label: 'CARDIO' },
  bodyweight: { color: 'magenta', label: 'WOD' },
};

// ============================================
// Main Component
// ============================================

export function ExerciseStoryCard({ exercise, animationDelay, animated, isPR, breakdownMovements }: ExerciseStoryCardProps) {
  const displayType = detectExerciseDisplayType(exercise);
  const { color, label } = META[displayType] || META.for_time;
  const boardLines = buildBoardLines(exercise, breakdownMovements);
  const hero = extractHero(exercise, displayType);
  const progression = extractProgression(exercise);
  const footer = extractFooterStats(exercise, displayType);

  const d = animationDelay;
  const anim = (delay: number) => animated
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: d + delay } }
    : {};

  return (
    <motion.div
      className={`${styles.card} ${styles[`card_${color}`]}`}
      initial={animated ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={animated
        ? { delay: d, duration: 0.4, ease: [0.16, 1, 0.3, 1] }
        : { delay: d, duration: 0.3 }
      }
    >
      {/* ── Header: type pill + PR badge ── */}
      <div className={styles.header}>
        <span className={`${styles.typePill} ${styles[`pill_${color}`]}`}>{label}</span>
        {isPR && <span className={styles.prBadge}>PR</span>}
      </div>

      {/* ── Exercise name ── */}
      <h3 className={styles.name}>{exercise.name}</h3>

      {/* ── Hero score (time / rounds / weight) ── */}
      {hero && (
        <motion.div className={styles.hero} {...anim(0.08)}>
          <span className={`${styles.heroValue} ${styles[`hero_${hero.color}`]}`}>
            {hero.value}
          </span>
          {hero.unit && <span className={styles.heroUnit}>{hero.unit}</span>}
        </motion.div>
      )}

      {/* ── Weight progression arrows ── */}
      {progression && (
        <motion.div className={styles.progression} {...anim(0.10)}>
          {progression.length <= 4 ? (
            progression.map((w, i) => (
              <span key={i}>
                {i > 0 && <span className={styles.arrow}> ➤ </span>}
                <span className={styles.progWeight}>{fmtWeight(w)}</span>
              </span>
            ))
          ) : (
            <>
              <span className={styles.progWeight}>{fmtWeight(progression[0])}</span>
              <span className={styles.arrow}> ➤ … ➤ </span>
              <span className={styles.progWeight}>{fmtWeight(progression[progression.length - 1])}</span>
            </>
          )}
          <span className={styles.progUnit}>kg</span>
        </motion.div>
      )}

      {/* ── Set bars for strength progression ── */}
      {progression && progression.length >= 2 && (
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

      {/* ── Board text: the prescription / movement list ── */}
      {boardLines.length > 0 && (
        <div className={styles.board}>
          {boardLines.map((line, i) => (
            <motion.div
              key={i}
              className={styles.boardLine}
              initial={animated ? { opacity: 0, x: -6 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={animated ? { delay: d + 0.14 + i * 0.04 } : undefined}
            >
              <span className={styles.boardDot} />
              <span className={styles.boardText}>{line}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Fallback: raw prescription when no movements parsed */}
      {boardLines.length === 0 && exercise.prescription && (
        <p className={styles.rawPrescription}>{exercise.prescription}</p>
      )}

      {/* ── Footer stats ── */}
      {footer.length > 0 && (
        <div className={styles.footer}>
          {footer.map((stat, i) => (
            <span key={i} className={styles.footerChip}>
              <span className={styles.footerValue}>{stat.value}</span>
              <span className={styles.footerLabel}>{stat.label}</span>
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
