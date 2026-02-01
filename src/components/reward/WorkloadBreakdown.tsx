import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { WorkloadBreakdown as WorkloadBreakdownType, MovementTotal } from '../../types';
import styles from './WorkloadBreakdown.module.css';

interface WorkloadBreakdownProps {
  breakdown: WorkloadBreakdownType;
  showTotals?: boolean;
  animationDelay?: number;
}

/**
 * Format time in seconds to mm:ss or just seconds
 */
function formatTime(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}:00`;
  }
  return `${seconds}s`;
}

/**
 * Format the value for display - handles combined metrics
 */
function formatValue(movement: MovementTotal): string {
  const parts: string[] = [];

  // Distance
  if (movement.totalDistance && movement.totalDistance > 0) {
    if (movement.totalDistance >= 1000) {
      parts.push(`${(movement.totalDistance / 1000).toFixed(1)}km`);
    } else {
      parts.push(`${movement.totalDistance}m`);
    }
  }

  // Time
  if (movement.totalTime && movement.totalTime > 0) {
    parts.push(formatTime(movement.totalTime));
  }

  // Calories
  if (movement.totalCalories && movement.totalCalories > 0) {
    parts.push(`${movement.totalCalories} cal`);
  }

  // Reps (only if no other metrics)
  if (parts.length === 0 && movement.totalReps && movement.totalReps > 0) {
    return movement.totalReps.toString();
  }

  // Combine with " + " for mixed metrics (e.g., "9km + 5:00")
  return parts.length > 0 ? parts.join(' + ') : '0';
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${meters}m`;
}

/**
 * Format volume for display
 */
function formatVolume(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(2)} tons`;
  }
  return `${Math.round(kg).toLocaleString()} kg`;
}

/**
 * Get shortened movement name for display
 */
function shortenName(name: string): string {
  // Common abbreviations
  const abbreviations: Record<string, string> = {
    'handstand push-up': 'HSPU',
    'handstand pushup': 'HSPU',
    'toes to bar': 'T2B',
    'knees to elbow': 'K2E',
    'chest to bar pull-up': 'C2B',
    'chest to bar pullup': 'C2B',
    'double under': 'DU',
    'single under': 'SU',
    'air squat': 'Air Squat',
    'push-up': 'Push-up',
    'pushup': 'Push-up',
    'pull-up': 'Pull-up',
    'pullup': 'Pull-up',
    'kettlebell swing': 'KB Swing',
    'russian kettlebell swing': 'RKB Swing',
    'american kettlebell swing': 'AKB Swing',
    'hang power clean': 'HPC',
    'power clean': 'PC',
    'squat clean': 'Squat Clean',
    'clean and jerk': 'C&J',
    'power snatch': 'P. Snatch',
    'squat snatch': 'Sq. Snatch',
    'overhead squat': 'OHS',
    'front squat': 'Front Squat',
    'back squat': 'Back Squat',
    'shoulder to overhead': 'S2OH',
  };

  const lowerName = name.toLowerCase();
  if (abbreviations[lowerName]) {
    return abbreviations[lowerName];
  }

  // Capitalize first letter of each word
  return name.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function WorkloadBreakdown({
  breakdown,
  showTotals = false,
  animationDelay = 0.65,
}: WorkloadBreakdownProps) {
  if (!breakdown.movements || breakdown.movements.length === 0) {
    return null;
  }

  // Only show aggregate distance if there's ONE movement type with distance
  // (e.g., don't sum Echo Bike + Sled Push - they're different activities)
  const distanceMovements = breakdown.movements.filter(m => m.totalDistance && m.totalDistance > 0);
  const hasMultipleDistanceTypes = distanceMovements.length > 1;
  const totalDistance = hasMultipleDistanceTypes ? 0 : (breakdown.grandTotalDistance ?? breakdown.movements.reduce(
    (sum, movement) => sum + (movement.totalDistance || 0),
    0
  ));

  // Same logic for calories - only aggregate if single movement type
  const calorieMovements = breakdown.movements.filter(m => m.totalCalories && m.totalCalories > 0);
  const hasMultipleCalorieTypes = calorieMovements.length > 1;
  const totalCalories = hasMultipleCalorieTypes ? 0 : (breakdown.grandTotalCalories ?? breakdown.movements.reduce(
    (sum, movement) => sum + (movement.totalCalories || 0),
    0
  ));
  const gridRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);

  // Group stagger - entire rows animate together for premium feel
  const rowStaggerDelay = 0.12; // Delay between rows
  const liquidEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;

    const minTileWidth = 100;
    const gap = 8;
    const updateColumns = () => {
      const width = grid.getBoundingClientRect().width;
      const nextColumns = Math.max(1, Math.floor((width + gap) / (minTileWidth + gap)));
      setColumns(nextColumns);
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  // Group movements by row for synchronized animation
  const rows: MovementTotal[][] = [];
  breakdown.movements.forEach((movement, idx) => {
    const rowIndex = Math.floor(idx / columns);
    if (!rows[rowIndex]) rows[rowIndex] = [];
    rows[rowIndex].push(movement);
  });

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: animationDelay }}
    >
      <span className={styles.sectionTitle}>Workload Breakdown</span>

      <div className={styles.grid} ref={gridRef}>
        {rows.map((row, rowIndex) => (
          <motion.div
            key={`row-${rowIndex}`}
            className={styles.row}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: animationDelay + rowIndex * rowStaggerDelay,
              duration: 0.35,
              ease: liquidEase,
            }}
          >
            {row.map((movement) => (
              <div
                key={movement.name}
                className={`${styles.tile} ${styles[movement.color || 'magenta']}`}
              >
                <span className={styles.value}>{formatValue(movement)}</span>
                <span className={styles.name}>{shortenName(movement.name)}</span>
                {movement.weight && movement.weight > 0 && (
                  <span className={styles.weight}>
                    @ {movement.weight}{movement.unit === 'lb' ? 'lb' : 'kg'}
                  </span>
                )}
              </div>
            ))}
          </motion.div>
        ))}
      </div>

      {showTotals && (breakdown.grandTotalReps > 0 || breakdown.grandTotalVolume > 0 || totalDistance > 0 || totalCalories > 0) && (
        <div className={styles.totals}>
          {breakdown.grandTotalReps > 0 && (
            <div className={styles.totalItem}>
              <span className={styles.totalValue}>{breakdown.grandTotalReps}</span>
              <span className={styles.totalLabel}>Total Reps</span>
            </div>
          )}
          {breakdown.grandTotalVolume > 0 && (
            <div className={styles.totalItem}>
              <span className={styles.totalValue}>{formatVolume(breakdown.grandTotalVolume)}</span>
              <span className={styles.totalLabel}>Volume</span>
            </div>
          )}
          {totalDistance > 0 && (
            <div className={styles.totalItem}>
              <span className={styles.totalValue}>{formatDistance(Math.round(totalDistance))}</span>
              <span className={styles.totalLabel}>Distance</span>
            </div>
          )}
          {totalCalories > 0 && (
            <div className={styles.totalItem}>
              <span className={styles.totalValue}>{Math.round(totalCalories)}</span>
              <span className={styles.totalLabel}>Calories</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
