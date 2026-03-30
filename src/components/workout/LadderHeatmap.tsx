import { motion } from 'framer-motion';
import type { MovementTotal } from '../../types';
import styles from './LadderHeatmap.module.css';

interface LadderHeatmapProps {
  ladderReps: number[];        // [4, 6, 8, 10, 12]
  ladderStep: number;          // how many rungs completed
  ladderPartial?: number;      // partial reps into next rung
  movements: MovementTotal[];  // for the movement totals below
}

function getRungValue(ladderReps: number[], rungIdx: number): number {
  if (rungIdx < ladderReps.length) return ladderReps[rungIdx];
  const step = ladderReps.length >= 2
    ? ladderReps[ladderReps.length - 1] - ladderReps[ladderReps.length - 2]
    : 2;
  return ladderReps[ladderReps.length - 1] + step * (rungIdx - ladderReps.length + 1);
}

/**
 * Visual representation of a ladder AMRAP workout result.
 * Shows a horizontal track of rungs: completed (magenta), partial, and empty.
 */
export function LadderHeatmap({ ladderReps, ladderStep, ladderPartial, movements }: LadderHeatmapProps) {
  // Show rungs up to one beyond the athlete's reach
  const visibleRungs = Math.max(ladderReps.length, ladderStep + 1);

  return (
    <div className={styles.container}>
      {/* Rung track */}
      <div className={styles.rungTrack}>
        {Array.from({ length: visibleRungs }).map((_, rungIdx) => {
          const rungVal = getRungValue(ladderReps, rungIdx);
          const isCompleted = rungIdx < ladderStep;
          const isPartial = rungIdx === ladderStep && (ladderPartial ?? 0) > 0;
          const stateClass = isCompleted
            ? styles.rungCompleted
            : isPartial
              ? styles.rungPartial
              : styles.rungEmpty;

          return (
            <motion.div
              key={rungIdx}
              className={`${styles.rung} ${stateClass}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: rungIdx * 0.06, duration: 0.25 }}
            >
              {isPartial ? `+${ladderPartial}` : rungVal}
            </motion.div>
          );
        })}
      </div>

      {/* Movement totals */}
      {movements.length > 0 && (
        <div className={styles.movementTotals}>
          {movements.map((m, i) => {
            const colorClass = m.color === 'yellow'
              ? styles.colorYellow
              : m.color === 'cyan'
                ? styles.colorCyan
                : styles.colorMagenta;

            const value = m.totalCalories
              ? `${m.totalCalories} cal`
              : m.totalDistance
                ? `${m.totalDistance}m`
                : m.totalReps
                  ? `${m.totalReps} reps`
                  : '';

            return (
              <div key={`${m.name}-${i}`} className={styles.movementRow}>
                <span className={styles.movementName}>{m.name}</span>
                <span className={`${styles.movementTotal} ${colorClass}`}>{value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
